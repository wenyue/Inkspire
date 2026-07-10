#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fnmatch
import json
import re
import shutil
import tempfile
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class SyncError(Exception):
    pass


@dataclass(frozen=True)
class Change:
    action: str
    path: str


@dataclass
class SyncContext:
    target_root: Path
    source_root: Path
    skill_root: Path
    check: bool
    changes: list[Change]


_TEMPLATE_PATTERN = re.compile(r'{{\s*([a-zA-Z0-9_.]+)\s*}}')
_DEFAULT_SOURCE_REF = 'master'
_RETIRED_SKILL_NAMES_BY_REPLACEMENT = {
    'setup-project-agents': ('update-project-rules',),
    'worktree-environment-setup': ('project-development-workflow',),
}


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError as error:
        raise SyncError(f'Missing config file: {path}') from error
    except json.JSONDecodeError as error:
        raise SyncError(f'Invalid JSON in {path}: {error}') from error
    if not isinstance(data, dict):
        raise SyncError(f'{path} must contain a JSON object')
    return data


def _source_archive_url(public_config: dict[str, Any]) -> str:
    configured_url = public_config.get('source_archive_url')
    if isinstance(configured_url, str) and configured_url:
        return configured_url
    repo = public_config.get('source_repo')
    if not isinstance(repo, str) or not repo:
        raise SyncError('public_assets.json requires source_repo or source_archive_url')
    ref = public_config.get('source_ref')
    if not isinstance(ref, str) or not ref:
        ref = _DEFAULT_SOURCE_REF
    return f'{repo.rstrip("/")}/archive/refs/heads/{ref}.zip'


def _find_archive_repo_root(extract_root: Path) -> Path:
    candidates = [path for path in extract_root.iterdir() if path.is_dir()]
    if len(candidates) == 1 and (candidates[0] / '.agents').is_dir():
        return candidates[0]
    if (extract_root / '.agents').is_dir():
        return extract_root
    for candidate in candidates:
        if (candidate / '.agents').is_dir():
            return candidate
    raise SyncError(f'Downloaded source archive does not contain a .agents directory: {extract_root}')


def _fetch_archive_source(public_config: dict[str, Any]) -> Path:
    archive_url = _source_archive_url(public_config)
    source_dir = Path(tempfile.mkdtemp(prefix='setup-project-agents-'))
    source_root = source_dir / 'source'
    archive_path = source_dir / 'source.zip'
    extract_root = source_dir / 'extract'
    try:
        urllib.request.urlretrieve(archive_url, archive_path)
        with zipfile.ZipFile(archive_path) as archive:
            archive.extractall(extract_root)
        extracted_source = _find_archive_repo_root(extract_root)
        shutil.move(str(extracted_source), source_root)
    except OSError as error:
        shutil.rmtree(source_dir, ignore_errors=True)
        raise SyncError(f'Failed to fetch source archive {archive_url}: {error}') from error
    except zipfile.BadZipFile as error:
        shutil.rmtree(source_dir, ignore_errors=True)
        raise SyncError(f'Source archive is not a valid zip file: {archive_url}') from error
    if not (source_root / '.agents').is_dir():
        shutil.rmtree(source_dir, ignore_errors=True)
        raise SyncError(f'Downloaded source archive is missing .agents: {archive_url}')
    return source_root


def resolve_source(public_config: dict[str, Any]) -> Path:
    return _fetch_archive_source(public_config)


def _require_items(config: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = config.get(key, [])
    if not isinstance(value, list):
        raise SyncError(f'{key} must be a list')
    for item in value:
        if not isinstance(item, dict):
            raise SyncError(f'{key} entries must be objects')
    return value


def _ignore_patterns(config: dict[str, Any]) -> list[str]:
    value = config.get('ignore', [])
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise SyncError('ignore must be a list of strings')
    return value


def _mirror_delete_enabled(config: dict[str, Any]) -> bool:
    value = config.get('mirror_delete', True)
    if not isinstance(value, bool):
        raise SyncError('mirror_delete must be a boolean')
    return value


def _is_ignored(relative: Path, ignore_patterns: list[str]) -> bool:
    path = relative.as_posix()
    return any(fnmatch.fnmatch(path, pattern) for pattern in ignore_patterns)


def _relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def _record_file(context: SyncContext, action: str, path: Path) -> None:
    context.changes.append(Change(action, _relative(path, context.target_root)))


def _write_bytes(context: SyncContext, target: Path, content: bytes) -> None:
    exists = target.exists()
    if exists and target.read_bytes() == content:
        _record_file(context, 'unchanged', target)
        return
    action = 'created' if not exists else 'updated'
    if not context.check:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    _record_file(context, action, target)


def _prune_empty_dirs(
    context: SyncContext,
    target: Path,
    ignore_patterns: list[str] | None = None,
) -> None:
    if not target.exists():
        return
    directories = sorted((path for path in target.rglob('*') if path.is_dir()), reverse=True)
    for directory in directories:
        if ignore_patterns and _is_ignored(directory.relative_to(target), ignore_patterns):
            continue
        if directory.exists() and not any(directory.iterdir()):
            if not context.check:
                directory.rmdir()
            _record_file(context, 'deleted', directory)


def _delete_path(context: SyncContext, target: Path) -> None:
    if not target.exists():
        return
    if target.is_dir():
        for child in sorted(target.rglob('*'), reverse=True):
            if child.is_file() or child.is_symlink():
                if not context.check:
                    child.unlink()
                _record_file(context, 'deleted', child)
            elif child.is_dir() and not any(child.iterdir()):
                if not context.check:
                    child.rmdir()
        if target.exists() and not any(target.iterdir()):
            if not context.check:
                target.rmdir()
        return
    if not context.check:
        target.unlink()
    _record_file(context, 'deleted', target)


def _copy_file(context: SyncContext, source: Path, target: Path) -> None:
    if not source.is_file():
        raise SyncError(f'Missing public asset: {source}')
    _write_bytes(context, target, source.read_bytes())


def _lookup_template_value(data: dict[str, Any], expression: str, template_name: str) -> str:
    value: Any = data
    for part in expression.split('.'):
        if not isinstance(value, dict) or part not in value:
            raise SyncError(f'Missing template variable {expression} in {template_name}')
        value = value[part]
    if isinstance(value, (dict, list)):
        raise SyncError(f'Template variable {expression} in {template_name} is not scalar')
    return str(value)


def _scalar_value(value: Any, default: str = '') -> str:
    if value is None:
        return default
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (dict, list)):
        return default
    text = str(value)
    return text if text else default


def _list_value(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def render_template(template: str, data: dict[str, Any], template_name: str) -> str:
    def replace(match: re.Match[str]) -> str:
        return _lookup_template_value(data, match.group(1), template_name)

    rendered = _TEMPLATE_PATTERN.sub(replace, template)
    if not rendered.strip():
        raise SyncError(f'Template rendered empty output: {template_name}')
    return rendered


def _template_text(context: SyncContext, template_name: str) -> str:
    template_path = context.skill_root / 'assets' / 'templates' / template_name
    if not template_path.is_file():
        raise SyncError(f'Missing template: {template_path}')
    return template_path.read_text(encoding='utf-8')


def _render_to_target(
    context: SyncContext,
    template_name: str,
    target_pattern: str,
    data: dict[str, Any],
) -> None:
    target_relative = render_template(target_pattern, data, target_pattern)
    rendered = render_template(_template_text(context, template_name), data, template_name)
    _write_bytes(context, context.target_root / target_relative, rendered.encode('utf-8'))


def _wrapper_root(target_pattern: str) -> Path:
    static_prefix = target_pattern.split('{{', 1)[0].rstrip('/\\')
    return Path(static_prefix)


def _delete_stale_wrapper_files(
    context: SyncContext,
    target_pattern: str,
    desired_paths: set[str],
    mirror_delete: bool,
) -> None:
    if not mirror_delete:
        return
    root = context.target_root / _wrapper_root(target_pattern)
    if not root.exists():
        return
    existing_paths = {
        path.relative_to(root).as_posix()
        for path in root.rglob('*')
        if path.is_file()
    }
    for relative_path in sorted(existing_paths - desired_paths):
        stale_path = root / relative_path
        if _is_generated_thin_wrapper(stale_path):
            _delete_path(context, stale_path)
    _prune_empty_dirs(context, root)


def _mirror_dir(
    context: SyncContext,
    source: Path,
    target: Path,
    ignore_patterns: list[str],
    mirror_delete: bool,
) -> None:
    if not source.is_dir():
        raise SyncError(f'Missing public asset directory: {source}')
    source_files = {
        path.relative_to(source)
        for path in source.rglob('*')
        if path.is_file() and not _is_ignored(path.relative_to(source), ignore_patterns)
    }
    target_files = set()
    if target.exists():
        target_files = {
            path.relative_to(target)
            for path in target.rglob('*')
            if path.is_file() and not _is_ignored(path.relative_to(target), ignore_patterns)
        }
    for relative in sorted(source_files):
        _copy_file(context, source / relative, target / relative)
    if mirror_delete:
        for relative in sorted(target_files - source_files):
            _delete_path(context, target / relative)
        _prune_empty_dirs(context, target, ignore_patterns)


def _strip_frontmatter(text: str) -> str:
    lines = text.splitlines()
    if not lines or lines[0] != '---':
        return text.strip()
    for index, line in enumerate(lines[1:], start=1):
        if line == '---':
            return '\n'.join(lines[index + 1 :]).strip()
    return text.strip()


def _is_generated_thin_wrapper(path: Path) -> bool:
    try:
        text = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        return False
    body = _strip_frontmatter(text)
    if re.fullmatch(r'Apply @\.agents/(rules|agents)/[A-Za-z0-9_.-]+\.md', body):
        return True
    if (
        'Keep this file thin and use the shared agent prompt as the source of truth.' in text
        and re.search(r'Follow `\.agents/agents/[A-Za-z0-9_.-]+\.md`\.', text)
    ):
        return True
    return False


def _yaml_list(values: list[str]) -> str:
    if not values:
        return '  []'
    return ''.join(f'  - "{value}"\n' for value in values).rstrip()


def _rule_data(rule: dict[str, Any]) -> dict[str, Any]:
    filename = rule['file']
    cursor = rule.get('cursor', {})
    claude = rule.get('claude', {})
    github = rule.get('github', {})
    return {
        'rule': {
            **rule,
            'path': f'.agents/rules/{filename}',
            'apply_ref': f'.agents/rules/{filename}',
            'name': filename.removesuffix('.md'),
            'cursor_description': _scalar_value(cursor.get('description'), ''),
            'cursor_globs': _scalar_value(cursor.get('globs'), '""'),
            'cursor_always_apply': str(bool(cursor.get('alwaysApply', False))).lower(),
            'claude_paths': _yaml_list(_list_value(claude.get('paths'))),
            'github_apply_to': _scalar_value(github.get('applyTo'), '**'),
        },
    }


def _agent_data(agent: dict[str, Any]) -> dict[str, Any]:
    name = agent['name']
    return {
        'agent': {
            **agent,
            'description': _scalar_value(
                agent.get('description'),
                f'Project-local agent: {name}',
            ),
            'model': _scalar_value(agent.get('model'), 'sonnet'),
            'path': f'.agents/agents/{name}.md',
            'apply_ref': f'.agents/agents/{name}.md',
        },
    }


def _read_strength(path: Path) -> str:
    if not path.is_file():
        return 'Default'
    for line in path.read_text(encoding='utf-8').splitlines():
        if line.startswith('Strength:'):
            return line.split(':', 1)[1].strip().strip('`') or 'Default'
    return 'Default'


def _read_frontmatter(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    lines = path.read_text(encoding='utf-8').splitlines()
    if not lines or lines[0] != '---':
        return {}
    values: dict[str, Any] = {}
    current_key = ''
    for line in lines[1:]:
        if line == '---':
            break
        if line.startswith('  - ') and current_key:
            current_value = values.setdefault(current_key, [])
            if not isinstance(current_value, list):
                current_value = []
                values[current_key] = current_value
            current_value.append(line.removeprefix('  - ').strip().strip('"'))
            continue
        if ':' in line and not line.startswith(' '):
            key, value = line.split(':', 1)
            current_key = key.strip()
            raw = value.strip()
            if raw == '':
                values[current_key] = ''
            elif raw in {'true', 'false'}:
                values[current_key] = raw == 'true'
            else:
                values[current_key] = raw.strip('"')
    return values


def _read_frontmatter_value(path: Path, key: str) -> str:
    return _scalar_value(_read_frontmatter(path).get(key), '')


def _public_skill_source(context: SyncContext, name: str) -> Path:
    source = context.source_root / '.agents' / 'skills' / name
    if source.is_dir():
        return source
    if context.skill_root.name == name and context.skill_root.is_dir():
        return context.skill_root
    return source


def _delete_retired_skill_dirs(
    context: SyncContext,
    replacement_name: str,
    mirror_delete: bool,
) -> None:
    if not mirror_delete:
        return
    for retired_name in _RETIRED_SKILL_NAMES_BY_REPLACEMENT.get(replacement_name, ()):
        retired_dir = context.target_root / '.agents' / 'skills' / retired_name
        skill_file = retired_dir / 'SKILL.md'
        if _read_frontmatter_value(skill_file, 'name') == retired_name:
            _delete_path(context, retired_dir)


def _referenced_skill_path(target_root: Path, agent_path: Path) -> Path | None:
    body = _strip_frontmatter(agent_path.read_text(encoding='utf-8'))
    match = re.fullmatch(r'Apply @(?P<path>\.agents/skills/[A-Za-z0-9_.-]+/SKILL\.md)', body)
    if not match:
        return None
    return target_root / Path(match.group('path'))


def _local_agent_description(target_root: Path, agent_path: Path, name: str) -> str:
    description = _read_frontmatter_value(agent_path, 'description')
    if description:
        return description
    skill_path = _referenced_skill_path(target_root, agent_path)
    if skill_path:
        description = _read_frontmatter_value(skill_path, 'description')
        if description:
            return description
    return f'Project-local agent: {name}'


def _read_agents_rule_rows(target_root: Path) -> dict[str, dict[str, str]]:
    agents_path = target_root / 'AGENTS.md'
    if not agents_path.is_file():
        return {}
    rows: dict[str, dict[str, str]] = {}
    pattern = re.compile(
        r'^\|\s*(?P<read_when>.*?)\s*\|\s*`\.agents/rules/(?P<file>[^`]+)`\s*\|\s*`(?P<strength>[^`]+)`\s*\|$'
    )
    for line in agents_path.read_text(encoding='utf-8').splitlines():
        match = pattern.match(line)
        if match:
            rows[match.group('file')] = {
                'read_when': match.group('read_when'),
                'strength': match.group('strength'),
            }
    return rows


def _default_project_read_when(filename: str) -> str:
    defaults = {
        '20-project-tools.md': 'Project tooling, MCP, runtime, or verification',
        '21-project-rules.md': 'Project APIs, generated files, lint, or domain conventions',
        '22-project-structure.md': 'Making structure, module, or dependency-boundary decisions',
    }
    return defaults.get(filename, 'Project-local rule applies')


def _default_project_cursor_description(filename: str) -> str:
    name = filename.removesuffix('.md')
    return f'[project] {name}'


def _local_rule_metadata(target_root: Path, filename: str, agents_rows: dict[str, dict[str, str]]) -> dict[str, Any]:
    name = filename.removesuffix('.md')
    cursor_frontmatter = _read_frontmatter(target_root / '.cursor' / 'rules' / f'{name}.mdc')
    claude_frontmatter = _read_frontmatter(target_root / '.claude' / 'rules' / filename)
    github_frontmatter = _read_frontmatter(
        target_root / '.github' / 'instructions' / f'{name}.instructions.md'
    )
    agents_row = agents_rows.get(filename, {})
    return {
        'read_when': agents_row.get('read_when') or _default_project_read_when(filename),
        'strength': agents_row.get('strength') or _read_strength(target_root / '.agents' / 'rules' / filename),
        'cursor': {
            'description': _scalar_value(
                cursor_frontmatter.get('description'),
                _default_project_cursor_description(filename),
            ),
            'globs': _scalar_value(cursor_frontmatter.get('globs'), '""'),
            'alwaysApply': cursor_frontmatter.get('alwaysApply', True),
        },
        'claude': {'paths': _list_value(claude_frontmatter.get('paths'))},
        'github': {'applyTo': _scalar_value(github_frontmatter.get('applyTo'), '**')},
    }


def discover_local_assets(target_root: Path, public_config: dict[str, Any]) -> dict[str, Any]:
    public_rule_files = {rule['file'] for rule in _require_items(public_config, 'rules')}
    public_agent_names = {agent['name'] for agent in _require_items(public_config, 'agent_prompts')}
    rules = []
    rules_root = target_root / '.agents' / 'rules'
    agents_rows = _read_agents_rule_rows(target_root)
    if rules_root.exists():
        for rule_path in sorted(rules_root.glob('*.md')):
            if rule_path.name in public_rule_files:
                continue
            metadata = _local_rule_metadata(target_root, rule_path.name, agents_rows)
            rules.append(
                {
                    'file': rule_path.name,
                    'read_when': metadata['read_when'],
                    'strength': metadata['strength'],
                    'section': 'project',
                    'cursor': metadata['cursor'],
                    'claude': metadata['claude'],
                    'github': metadata['github'],
                }
            )
    agent_prompts = []
    agents_root = target_root / '.agents' / 'agents'
    if agents_root.exists():
        for agent_path in sorted(agents_root.glob('*.md')):
            name = agent_path.stem
            if name in public_agent_names:
                continue
            description = _local_agent_description(target_root, agent_path, name)
            model = _read_frontmatter_value(agent_path, 'model') or 'sonnet'
            agent_prompts.append({'name': name, 'description': description, 'model': model})
    return {'rules': rules, 'agent_prompts': agent_prompts}


def _merge_local_assets(primary: dict[str, Any], secondary: dict[str, Any]) -> dict[str, Any]:
    merged_rules = {rule['file']: rule for rule in _require_items(primary, 'rules')}
    for rule in _require_items(secondary, 'rules'):
        merged_rules.setdefault(rule['file'], rule)
    merged_agents = {agent['name']: agent for agent in _require_items(primary, 'agent_prompts')}
    for agent in _require_items(secondary, 'agent_prompts'):
        existing = merged_agents.get(agent['name'])
        if not existing:
            merged_agents[agent['name']] = agent
            continue
        existing_description = _scalar_value(existing.get('description'), '')
        discovered_description = _scalar_value(agent.get('description'), '')
        if (
            discovered_description
            and (
                not existing_description
                or existing_description == f"Project-local agent: {agent['name']}"
            )
        ):
            merged_agents[agent['name']] = {**existing, 'description': discovered_description}
    return {
        'rules': list(merged_rules.values()),
        'agent_prompts': list(merged_agents.values()),
    }


def _rule_row(rule: dict[str, Any]) -> str:
    return f"| {rule['read_when']} | `.agents/rules/{rule['file']}` | `{rule['strength']}` |"


def _rows_for_section(rules: list[dict[str, Any]], section: str) -> str:
    rows = [_rule_row(rule) for rule in rules if rule.get('section') == section]
    return '\n'.join(rows)


def _generate_wrappers(
    context: SyncContext,
    public_config: dict[str, Any],
    local_config: dict[str, Any],
    mirror_delete: bool,
) -> None:
    platforms = public_config.get('platforms') or {}
    rule_wrappers = _require_items(platforms, 'rule_wrappers')
    agent_wrappers = _require_items(platforms, 'agent_wrappers')
    all_rules = _require_items(public_config, 'rules') + _require_items(local_config, 'rules')
    all_agents = _require_items(public_config, 'agent_prompts') + _require_items(
        local_config,
        'agent_prompts',
    )
    desired_rule_paths_by_wrapper = {wrapper['path']: set() for wrapper in rule_wrappers}
    desired_agent_paths_by_wrapper = {wrapper['path']: set() for wrapper in agent_wrappers}
    for rule in all_rules:
        for wrapper in rule_wrappers:
            rendered_target = render_template(wrapper['path'], _rule_data(rule), wrapper['path'])
            desired_rule_paths_by_wrapper[wrapper['path']].add(
                Path(rendered_target).relative_to(_wrapper_root(wrapper['path'])).as_posix()
            )
            _render_to_target(context, wrapper['template'], wrapper['path'], _rule_data(rule))
    for agent in all_agents:
        for wrapper in agent_wrappers:
            rendered_target = render_template(wrapper['path'], _agent_data(agent), wrapper['path'])
            desired_agent_paths_by_wrapper[wrapper['path']].add(
                Path(rendered_target).relative_to(_wrapper_root(wrapper['path'])).as_posix()
            )
            _render_to_target(context, wrapper['template'], wrapper['path'], _agent_data(agent))
    for wrapper in rule_wrappers:
        _delete_stale_wrapper_files(
            context,
            wrapper['path'],
            desired_rule_paths_by_wrapper[wrapper['path']],
            mirror_delete,
        )
    for wrapper in agent_wrappers:
        _delete_stale_wrapper_files(
            context,
            wrapper['path'],
            desired_agent_paths_by_wrapper[wrapper['path']],
            mirror_delete,
        )


def _generate_agents_entry(
    context: SyncContext,
    public_config: dict[str, Any],
    local_config: dict[str, Any],
) -> None:
    template_path = context.skill_root / 'assets' / 'templates' / 'AGENTS.md'
    if not template_path.is_file():
        return
    all_rules = _require_items(public_config, 'rules') + _require_items(local_config, 'rules')
    template = template_path.read_text(encoding='utf-8')
    rendered = render_template(
        template,
        {
            'global_rule_rows': _rows_for_section(all_rules, 'global'),
            'base_rule_rows': _rows_for_section(all_rules, 'base'),
            'project_rule_rows': _rows_for_section(all_rules, 'project'),
        },
        'AGENTS.md',
    )
    _write_bytes(context, context.target_root / 'AGENTS.md', rendered.encode('utf-8'))


def sync_public_assets(
    context: SyncContext,
    public_config: dict[str, Any],
    local_config: dict[str, Any],
) -> list[Change]:
    ignore_patterns = _ignore_patterns(public_config)
    mirror_delete = _mirror_delete_enabled(public_config)
    for rule in _require_items(public_config, 'rules'):
        filename = rule.get('file')
        if not isinstance(filename, str) or not filename:
            raise SyncError('Each public rule requires file')
        _copy_file(
            context,
            context.source_root / '.agents' / 'rules' / filename,
            context.target_root / '.agents' / 'rules' / filename,
        )
    for skill in _require_items(public_config, 'skills'):
        name = skill.get('name')
        if not isinstance(name, str) or not name:
            raise SyncError('Each public skill requires name')
        _mirror_dir(
            context,
            _public_skill_source(context, name),
            context.target_root / '.agents' / 'skills' / name,
            ignore_patterns,
            mirror_delete,
        )
        _delete_retired_skill_dirs(context, name, mirror_delete)
    for generator in _require_items(public_config, 'project_skill_generators'):
        name = generator.get('name')
        if isinstance(name, str) and name:
            _delete_retired_skill_dirs(context, name, mirror_delete)
    for agent in _require_items(public_config, 'agent_prompts'):
        name = agent.get('name')
        if not isinstance(name, str) or not name:
            raise SyncError('Each public agent prompt requires name')
        _copy_file(
            context,
            context.source_root / '.agents' / 'agents' / f'{name}.md',
            context.target_root / '.agents' / 'agents' / f'{name}.md',
        )
    merged_local_config = _merge_local_assets(
        local_config,
        discover_local_assets(context.target_root, public_config),
    )
    _generate_wrappers(context, public_config, merged_local_config, mirror_delete)
    _generate_agents_entry(context, public_config, merged_local_config)
    return context.changes


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Sync public agent assets from wenyue/agents.')
    parser.add_argument('--check', action='store_true', help='Report drift without writing files.')
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    target_root = Path.cwd()
    skill_root = Path(__file__).resolve().parents[1]
    try:
        public_config = load_json(skill_root / 'references' / 'public_assets.json')
        local_config = discover_local_assets(target_root, public_config)
        source_root = resolve_source(public_config)
        context = SyncContext(
            target_root=target_root,
            source_root=source_root,
            skill_root=skill_root,
            check=args.check,
            changes=[],
        )
        changes = sync_public_assets(context, public_config, local_config)
    except SyncError as error:
        print(f'ERROR: {error}')
        return 2
    for change in changes:
        print(f'{change.action} {change.path}')
    if args.check and any(change.action in {'created', 'updated', 'deleted'} for change in changes):
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
