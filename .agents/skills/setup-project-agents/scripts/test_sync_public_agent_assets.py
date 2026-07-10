import contextlib
import io
import os
import json
import shutil
import tempfile
import unittest
import zipfile
from unittest import mock
from pathlib import Path

import sync_public_agent_assets as sync


REPO_SKILL_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = REPO_SKILL_ROOT.parents[2]
REPO_REFERENCES = REPO_SKILL_ROOT / 'references'
REPO_TEMPLATES = REPO_SKILL_ROOT / 'assets' / 'templates'


class SyncPublicAgentAssetsTest(unittest.TestCase):
    def test_load_json_returns_object(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / 'config.json'
            path.write_text('{"source_repo": "https://example.invalid/repo"}\n', encoding='utf-8')

            result = sync.load_json(path)

        self.assertEqual(result, {'source_repo': 'https://example.invalid/repo'})

    def test_load_json_rejects_non_object(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / 'config.json'
            path.write_text('[]\n', encoding='utf-8')

            with self.assertRaises(sync.SyncError) as error:
                sync.load_json(path)

        self.assertIn('must contain a JSON object', str(error.exception))

    def test_parser_rejects_local_source_argument(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            sync.build_parser().parse_args(['--source', 'local-agents'])

    def test_resolve_source_ignores_local_default_and_fetches_archive(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            target = root / 'target'
            target.mkdir()
            local_source = root / 'agents'
            (local_source / '.agents' / 'rules').mkdir(parents=True)
            (local_source / '.agents' / 'rules' / '10-base-code.md').write_text('local\n', encoding='utf-8')
            archive = root / 'agents.zip'
            with zipfile.ZipFile(archive, 'w') as package:
                package.writestr('agents-master/.agents/rules/10-base-code.md', 'archive\n')
            public_config = {
                'source_archive_url': archive.resolve().as_uri(),
            }

            try:
                result = sync.resolve_source(public_config)
            except sync.SyncError as error:
                self.fail(f'resolve_source should fetch archive: {error}')

            self.assertEqual((result / '.agents' / 'rules' / '10-base-code.md').read_text(), 'archive\n')

    def test_resolve_source_refetches_archive_every_time(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            archive = root / 'agents.zip'
            public_config = {
                'source_archive_url': archive.resolve().as_uri(),
            }

            with zipfile.ZipFile(archive, 'w') as package:
                package.writestr('agents-master/.agents/rules/10-base-code.md', 'first\n')
            first = sync.resolve_source(public_config)

            archive.unlink()
            with zipfile.ZipFile(archive, 'w') as package:
                package.writestr('agents-master/.agents/rules/10-base-code.md', 'second\n')
            second = sync.resolve_source(public_config)

        self.assertNotEqual(first, second)
        self.assertEqual((first / '.agents' / 'rules' / '10-base-code.md').read_text(), 'first\n')
        self.assertEqual((second / '.agents' / 'rules' / '10-base-code.md').read_text(), 'second\n')

    def test_archive_fallback_syncs_only_manifest_whitelisted_assets(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            target = root / 'target'
            target.mkdir()
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            skill_root.mkdir(parents=True)
            archive = root / 'agents.zip'
            with zipfile.ZipFile(archive, 'w') as package:
                package.writestr('agents-master/README.md', 'public readme\n')
                package.writestr('agents-master/.agents/rules/10-base-code.md', 'rule\n')
                package.writestr('agents-master/.agents/skills/rename/SKILL.md', 'rename skill\n')
                package.writestr('agents-master/.agents/skills/unlisted/SKILL.md', 'unlisted skill\n')
                package.writestr('agents-master/.agents/agents/rename.md', 'rename agent\n')
            public_config = {
                'source_archive_url': archive.resolve().as_uri(),
                'mirror_delete': True,
                'rules': [{'file': '10-base-code.md'}],
                'skills': [{'name': 'rename'}],
                'agent_prompts': [{'name': 'rename'}],
            }
            source = sync.resolve_source(public_config)
            context = sync.SyncContext(target, source, skill_root, False, [])

            sync.sync_public_assets(context, public_config, {'rules': [], 'agent_prompts': []})

            self.assertEqual((target / '.agents' / 'rules' / '10-base-code.md').read_text(), 'rule\n')
            self.assertEqual((target / '.agents' / 'skills' / 'rename' / 'SKILL.md').read_text(), 'rename skill\n')
            self.assertEqual((target / '.agents' / 'agents' / 'rename.md').read_text(), 'rename agent\n')
            self.assertFalse((target / 'README.md').exists())
            self.assertFalse((target / '.agents' / 'skills' / 'unlisted').exists())

    def test_sync_copies_public_rule_skill_and_agent_prompt(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            (source / '.agents' / 'rules').mkdir(parents=True)
            (source / '.agents' / 'skills' / 'rename').mkdir(parents=True)
            (source / '.agents' / 'agents').mkdir(parents=True)
            (target / '.agents' / 'rules').mkdir(parents=True)
            skill_root.mkdir(parents=True)
            (source / '.agents' / 'rules' / '10-base-code.md').write_text('rule\n', encoding='utf-8')
            (source / '.agents' / 'skills' / 'rename' / 'SKILL.md').write_text('skill\n', encoding='utf-8')
            (source / '.agents' / 'agents' / 'rename.md').write_text('agent\n', encoding='utf-8')
            public_config = {
                'mirror_delete': True,
                'rules': [{'file': '10-base-code.md'}],
                'skills': [{'name': 'rename'}],
                'agent_prompts': [{'name': 'rename'}],
            }
            context = sync.SyncContext(target, source, skill_root, False, [])

            changes = sync.sync_public_assets(context, public_config, {'rules': [], 'agent_prompts': []})

            self.assertIn(sync.Change('created', '.agents/rules/10-base-code.md'), changes)
            self.assertEqual((target / '.agents' / 'rules' / '10-base-code.md').read_text(), 'rule\n')
            self.assertEqual((target / '.agents' / 'skills' / 'rename' / 'SKILL.md').read_text(), 'skill\n')
            self.assertEqual((target / '.agents' / 'agents' / 'rename.md').read_text(), 'agent\n')

    def test_sync_marks_existing_unchanged_public_rule_as_unchanged(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            (source / '.agents' / 'rules').mkdir(parents=True)
            (target / '.agents' / 'rules').mkdir(parents=True)
            skill_root.mkdir(parents=True)
            (source / '.agents' / 'rules' / '10-base-code.md').write_text('rule\n', encoding='utf-8')
            (target / '.agents' / 'rules' / '10-base-code.md').write_text('rule\n', encoding='utf-8')
            public_config = {
                'mirror_delete': True,
                'rules': [{'file': '10-base-code.md'}],
                'skills': [],
                'agent_prompts': [],
            }
            context = sync.SyncContext(target, source, skill_root, False, [])

            changes = sync.sync_public_assets(context, public_config, {'rules': [], 'agent_prompts': []})

            self.assertEqual(changes, [sync.Change('unchanged', '.agents/rules/10-base-code.md')])
            self.assertEqual((target / '.agents' / 'rules' / '10-base-code.md').read_text(), 'rule\n')

    def test_sync_deletes_extra_file_inside_public_skill(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            (source / '.agents' / 'skills' / 'rename').mkdir(parents=True)
            (target / '.agents' / 'skills' / 'rename').mkdir(parents=True)
            skill_root.mkdir(parents=True)
            (source / '.agents' / 'skills' / 'rename' / 'SKILL.md').write_text('skill\n', encoding='utf-8')
            extra = target / '.agents' / 'skills' / 'rename' / 'extra.md'
            extra.write_text('local\n', encoding='utf-8')
            public_config = {
                'mirror_delete': True,
                'rules': [],
                'skills': [{'name': 'rename'}],
                'agent_prompts': [],
            }
            context = sync.SyncContext(target, source, skill_root, False, [])

            sync.sync_public_assets(context, public_config, {'rules': [], 'agent_prompts': []})

            self.assertFalse(extra.exists())

    def test_sync_preserves_extra_file_inside_public_skill_when_mirror_delete_is_false(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            (source / '.agents' / 'skills' / 'rename').mkdir(parents=True)
            (target / '.agents' / 'skills' / 'rename').mkdir(parents=True)
            skill_root.mkdir(parents=True)
            (source / '.agents' / 'skills' / 'rename' / 'SKILL.md').write_text('skill\n', encoding='utf-8')
            extra = target / '.agents' / 'skills' / 'rename' / 'extra.md'
            extra.write_text('local\n', encoding='utf-8')
            public_config = {
                'mirror_delete': False,
                'rules': [],
                'skills': [{'name': 'rename'}],
                'agent_prompts': [],
            }
            context = sync.SyncContext(target, source, skill_root, False, [])

            sync.sync_public_assets(context, public_config, {'rules': [], 'agent_prompts': []})

            self.assertTrue(extra.exists())

    def test_sync_deletes_extra_empty_directory_tree_inside_public_skill(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            (source / '.agents' / 'skills' / 'rename').mkdir(parents=True)
            (target / '.agents' / 'skills' / 'rename' / 'unused' / 'nested').mkdir(parents=True)
            skill_root.mkdir(parents=True)
            (source / '.agents' / 'skills' / 'rename' / 'SKILL.md').write_text('skill\n', encoding='utf-8')
            public_config = {
                'mirror_delete': True,
                'rules': [],
                'skills': [{'name': 'rename'}],
                'agent_prompts': [],
            }
            context = sync.SyncContext(target, source, skill_root, False, [])

            sync.sync_public_assets(context, public_config, {'rules': [], 'agent_prompts': []})

            self.assertFalse((target / '.agents' / 'skills' / 'rename' / 'unused').exists())

    def test_sync_deletes_legacy_public_skill_directory_for_renamed_skill(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            source_skill = source / '.agents' / 'skills' / 'setup-project-agents'
            legacy_skill = target / '.agents' / 'skills' / 'update-project-rules'
            source_skill.mkdir(parents=True)
            legacy_skill.mkdir(parents=True)
            skill_root.mkdir(parents=True)
            (source_skill / 'SKILL.md').write_text('new skill\n', encoding='utf-8')
            (legacy_skill / 'SKILL.md').write_text(
                '---\nname: update-project-rules\ndescription: Legacy\n---\n',
                encoding='utf-8',
            )
            public_config = {
                'mirror_delete': True,
                'rules': [],
                'skills': [{'name': 'setup-project-agents'}],
                'agent_prompts': [],
            }
            context = sync.SyncContext(target, source, skill_root, False, [])

            sync.sync_public_assets(context, public_config, {'rules': [], 'agent_prompts': []})

            self.assertFalse(legacy_skill.exists())
            self.assertEqual(
                (target / '.agents' / 'skills' / 'setup-project-agents' / 'SKILL.md').read_text(),
                'new skill\n',
            )

    def test_sync_uses_running_skill_when_source_archive_lacks_renamed_skill(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            skill_root.mkdir(parents=True)
            (source / '.agents' / 'skills').mkdir(parents=True)
            (skill_root / 'SKILL.md').write_text('running skill\n', encoding='utf-8')
            public_config = {
                'mirror_delete': True,
                'rules': [],
                'skills': [{'name': 'setup-project-agents'}],
                'agent_prompts': [],
            }
            context = sync.SyncContext(target, source, skill_root, False, [])

            sync.sync_public_assets(context, public_config, {'rules': [], 'agent_prompts': []})

            self.assertEqual(
                (target / '.agents' / 'skills' / 'setup-project-agents' / 'SKILL.md').read_text(),
                'running skill\n',
            )

    def test_sync_ignores_generated_files_inside_public_skill(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            source_skill = source / '.agents' / 'skills' / 'rename'
            target_skill = target / '.agents' / 'skills' / 'rename'
            (source_skill / 'scripts' / '__pycache__').mkdir(parents=True)
            (target_skill / 'scripts' / '__pycache__').mkdir(parents=True)
            skill_root.mkdir(parents=True)
            (source_skill / 'SKILL.md').write_text('skill\n', encoding='utf-8')
            (source_skill / 'scripts' / '__pycache__' / 'source.cpython-310.pyc').write_bytes(b'source')
            target_cache = target_skill / 'scripts' / '__pycache__' / 'target.cpython-310.pyc'
            target_cache.write_bytes(b'target')
            public_config = {
                'mirror_delete': True,
                'ignore': [
                    '__pycache__',
                    '__pycache__/**',
                    '**/__pycache__',
                    '**/__pycache__/**',
                    '*.pyc',
                    '**/*.pyc',
                ],
                'rules': [],
                'skills': [{'name': 'rename'}],
                'agent_prompts': [],
            }
            context = sync.SyncContext(target, source, skill_root, False, [])

            changes = sync.sync_public_assets(context, public_config, {'rules': [], 'agent_prompts': []})

            self.assertEqual(changes, [sync.Change('created', '.agents/skills/rename/SKILL.md')])
            self.assertTrue(target_cache.exists())
            self.assertFalse((target_skill / 'scripts' / '__pycache__' / 'source.cpython-310.pyc').exists())

    def test_sync_generates_rule_wrapper_from_real_platform_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            templates = skill_root / 'assets' / 'templates'
            (source / '.agents' / 'rules').mkdir(parents=True)
            templates.mkdir(parents=True)
            for template in REPO_TEMPLATES.glob('*'):
                shutil.copy2(template, templates / template.name)
            (source / '.agents' / 'rules' / '10-base-code.md').write_text('rule\n', encoding='utf-8')
            public_config = sync.load_json(REPO_REFERENCES / 'public_assets.json')
            public_config['rules'] = [rule for rule in public_config['rules'] if rule['file'] == '10-base-code.md']
            public_config['skills'] = []
            public_config['agent_prompts'] = []
            local_config = {'rules': [], 'agent_prompts': []}
            context = sync.SyncContext(target, source, skill_root, False, [])

            sync.sync_public_assets(context, public_config, local_config)

            expected = (
                '---\n'
                'paths:\n'
                '  - "**/*.{dart,cpp,c,h,hpp,cc,py,js,jsx,ts,tsx,sh}"\n'
                '---\n\n'
                'Apply @.agents/rules/10-base-code.md\n'
            )
            self.assertEqual(
                (target / '.claude' / 'rules' / '10-base-code.md').read_text(encoding='utf-8'),
                expected,
            )

    def test_sync_deletes_stale_rule_wrapper_when_rule_is_removed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            templates = skill_root / 'assets' / 'templates'
            (source / '.agents' / 'rules').mkdir(parents=True)
            templates.mkdir(parents=True)
            for template in REPO_TEMPLATES.glob('*'):
                shutil.copy2(template, templates / template.name)
            (source / '.agents' / 'rules' / '00-global-rule-config.md').write_text('rule\n', encoding='utf-8')
            stale_wrapper = target / '.claude' / 'rules' / '10-base-code.md'
            stale_wrapper.parent.mkdir(parents=True)
            stale_wrapper.write_text(
                '---\npaths:\n  []\n---\n\nApply @.agents/rules/10-base-code.md\n',
                encoding='utf-8',
            )
            public_config = sync.load_json(REPO_REFERENCES / 'public_assets.json')
            public_config['rules'] = [
                rule for rule in public_config['rules'] if rule['file'] == '00-global-rule-config.md'
            ]
            public_config['skills'] = []
            public_config['agent_prompts'] = []
            local_config = {'rules': [], 'agent_prompts': []}
            context = sync.SyncContext(target, source, skill_root, False, [])

            sync.sync_public_assets(context, public_config, local_config)

            self.assertFalse(stale_wrapper.exists())

    def test_sync_preserves_custom_platform_only_agent_wrapper(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            templates = skill_root / 'assets' / 'templates'
            templates.mkdir(parents=True)
            for template in REPO_TEMPLATES.glob('*'):
                shutil.copy2(template, templates / template.name)
            stale_wrapper = target / '.github' / 'agents' / 'obsolete-agent.agent.md'
            stale_wrapper.parent.mkdir(parents=True)
            stale_wrapper.write_text('# Custom platform-only agent\n', encoding='utf-8')
            public_config = sync.load_json(REPO_REFERENCES / 'public_assets.json')
            public_config['rules'] = []
            public_config['skills'] = []
            public_config['agent_prompts'] = []
            local_config = {'rules': [], 'agent_prompts': []}
            context = sync.SyncContext(target, source, skill_root, False, [])

            sync.sync_public_assets(context, public_config, local_config)

            self.assertTrue(stale_wrapper.exists())

    def test_sync_deletes_stale_generated_agent_wrapper_when_agent_is_removed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            templates = skill_root / 'assets' / 'templates'
            templates.mkdir(parents=True)
            for template in REPO_TEMPLATES.glob('*'):
                shutil.copy2(template, templates / template.name)
            stale_wrapper = target / '.github' / 'agents' / 'obsolete-agent.agent.md'
            stale_wrapper.parent.mkdir(parents=True)
            stale_wrapper.write_text(
                '---\nname: obsolete-agent\ndescription: Obsolete\n---\n\n'
                'Apply @.agents/agents/obsolete-agent.md\n',
                encoding='utf-8',
            )
            public_config = sync.load_json(REPO_REFERENCES / 'public_assets.json')
            public_config['rules'] = []
            public_config['skills'] = []
            public_config['agent_prompts'] = []
            local_config = {'rules': [], 'agent_prompts': []}
            context = sync.SyncContext(target, source, skill_root, False, [])

            sync.sync_public_assets(context, public_config, local_config)

            self.assertFalse(stale_wrapper.exists())

    def test_sync_generates_agents_entry_from_template(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            templates = skill_root / 'assets' / 'templates'
            templates.mkdir(parents=True)
            (templates / 'AGENTS.md').write_text(
                '# Project Agent Entry\n\n{{global_rule_rows}}\n{{base_rule_rows}}\n{{project_rule_rows}}\n',
                encoding='utf-8',
            )
            source_rules = source / '.agents' / 'rules'
            source_rules.mkdir(parents=True)
            (source_rules / '00-global-rule-config.md').write_text('rule\n', encoding='utf-8')
            (source_rules / '20-project-tools.md').write_text('rule\n', encoding='utf-8')
            public_config = sync.load_json(REPO_REFERENCES / 'public_assets.json')
            public_config['rules'] = [
                rule
                for rule in public_config['rules']
                if rule['file'] == '00-global-rule-config.md'
            ]
            public_config['skills'] = []
            public_config['agent_prompts'] = []
            public_config['platforms'] = {'rule_wrappers': [], 'agent_wrappers': []}
            local_config = {
                'rules': [
                    {
                        'file': '20-project-tools.md',
                        'read_when': 'Project tooling, MCP, runtime, or verification',
                        'strength': 'Mandatory',
                        'section': 'project',
                    },
                ],
                'agent_prompts': [],
            }
            context = sync.SyncContext(target, source, skill_root, False, [])

            sync.sync_public_assets(context, public_config, local_config)

            entry = (target / 'AGENTS.md').read_text(encoding='utf-8')
            self.assertIn(
                '| Starting any repository task | `.agents/rules/00-global-rule-config.md` |'
                ' `Mandatory` |',
                entry,
            )
            self.assertIn(
                '| Project tooling, MCP, runtime, or verification |'
                ' `.agents/rules/20-project-tools.md` | `Mandatory` |',
                entry,
            )

    def test_sync_does_not_create_missing_project_rule_placeholder(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            source_rules = source / '.agents' / 'rules'
            source_rules.mkdir(parents=True)
            skill_root.mkdir(parents=True)
            (source_rules / '20-project-tools.md').write_text('project tools placeholder\n', encoding='utf-8')
            public_config = {
                'mirror_delete': True,
                'rules': [],
                'skills': [],
                'agent_prompts': [],
            }
            context = sync.SyncContext(target, source, skill_root, False, [])

            changes = sync.sync_public_assets(context, public_config, {'rules': [], 'agent_prompts': []})

            target_rule = target / '.agents' / 'rules' / '20-project-tools.md'
            self.assertFalse(target_rule.exists())
            self.assertNotIn(sync.Change('created', '.agents/rules/20-project-tools.md'), changes)

    def test_sync_deletes_legacy_project_skill_without_copying_generator_contract(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            source_skill = source / '.agents' / 'skills' / 'worktree-environment-setup'
            legacy_skill = target / '.agents' / 'skills' / 'project-development-workflow'
            source_skill.mkdir(parents=True)
            legacy_skill.mkdir(parents=True)
            skill_root.mkdir(parents=True)
            (source_skill / 'SKILL.md').write_text(
                '---\n'
                'name: worktree-environment-setup\n'
                'description: Generator contract\n'
                '---\n',
                encoding='utf-8',
            )
            (legacy_skill / 'SKILL.md').write_text(
                '---\n'
                'name: project-development-workflow\n'
                'description: Legacy\n'
                '---\n',
                encoding='utf-8',
            )
            public_config = {
                'mirror_delete': True,
                'rules': [],
                'skills': [],
                'project_skill_generators': [{'name': 'worktree-environment-setup'}],
                'agent_prompts': [],
            }
            context = sync.SyncContext(target, source, skill_root, False, [])

            changes = sync.sync_public_assets(context, public_config, {'rules': [], 'agent_prompts': []})

            self.assertFalse(legacy_skill.exists())
            self.assertFalse(
                (target / '.agents' / 'skills' / 'worktree-environment-setup').exists()
            )
            self.assertIn(
                sync.Change('deleted', '.agents/skills/project-development-workflow/SKILL.md'),
                changes,
            )

    def test_project_rules_use_generator_contract_style(self):
        for filename in [
            '20-project-tools.md',
            '21-project-rules.md',
            '22-project-structure.md',
        ]:
            with self.subTest(filename=filename):
                content = (REPO_ROOT / '.agents' / 'rules' / filename).read_text(encoding='utf-8')

                self.assertIn('\nStrength: `', content)
                self.assertIn('\nScope: ', content)
                self.assertIn('## Generation Contract', content)
                self.assertIn('## What Belongs Here', content)
                self.assertIn('## What Does Not Belong Here', content)
                self.assertIn('## Suggested Generated Content', content)
                self.assertNotIn('## Placeholder', content)
                self.assertNotIn('## Suggested Content', content)

    def test_worktree_environment_setup_is_generator_contract(self):
        workflow = (
            REPO_ROOT
            / '.agents'
            / 'skills'
            / 'worktree-environment-setup'
            / 'SKILL.md'
        )
        content = workflow.read_text(encoding='utf-8')

        self.assertTrue(
            content.startswith(
                '---\n'
                'name: worktree-environment-setup\n'
                'description: Use when defining, generating, or validating a target repository'
            )
        )
        self.assertIn('## Generation Contract', content)
        self.assertIn('## What Belongs Here', content)
        self.assertIn('## What Does Not Belong Here', content)
        self.assertIn('## Suggested Generated Content', content)
        self.assertIn('generator contract', content)
        self.assertIn('.agents/rules/20-project-tools.md', content)
        self.assertIn('already-created Git worktree', content)
        self.assertIn('linter', content)
        self.assertIn('formatter', content)
        self.assertIn('generated files', content)
        self.assertIn('real temporary worktree', content)
        self.assertIn('ordinary use', content)
        self.assertNotIn('merge-back', content)
        self.assertNotIn('create or enter an isolated', content)
        self.assertNotIn('\nStrength:', content)
        self.assertNotIn('\nScope:', content)
        self.assertFalse((REPO_ROOT / '.agents' / 'skills' / 'project-development-workflow').exists())

    def test_setup_project_agents_requires_subagent_local_generation(self):
        content = (REPO_SKILL_ROOT / 'SKILL.md').read_text(encoding='utf-8')

        self.assertIn('subagent', content)
        self.assertIn('generator contracts', content)
        self.assertIn('.agents/rules/20-project-tools.md', content)
        self.assertIn('.agents/rules/21-project-rules.md', content)
        self.assertIn('.agents/rules/22-project-structure.md', content)
        self.assertIn('.agents/skills/worktree-environment-setup/SKILL.md', content)
        self.assertIn('blocker', content)

    def test_setup_project_agents_regenerates_environment_skill(self):
        content = (REPO_SKILL_ROOT / 'SKILL.md').read_text(encoding='utf-8')

        self.assertIn('delete `.agents/skills/project-development-workflow/`', content)
        self.assertIn('Do not read, copy, or migrate', content)
        self.assertIn('current target repository evidence', content)
        self.assertIn('real temporary worktree', content)
        self.assertIn('byte-identical', content)
        self.assertIn('created or materially changed', content)
        self.assertIn('ordinary use', content)

    def test_worktree_integrate_is_public_skill(self):
        skill_path = REPO_ROOT / '.agents' / 'skills' / 'worktree-integrate' / 'SKILL.md'
        content = skill_path.read_text(encoding='utf-8')
        normalized_content = ' '.join(content.split())
        public_config = sync.load_json(REPO_REFERENCES / 'public_assets.json')
        rule = (REPO_ROOT / '.agents' / 'rules' / '03-global-skill-config.md').read_text(
            encoding='utf-8'
        )

        self.assertIn({'name': 'worktree-integrate'}, public_config['skills'])
        self.assertTrue(
            content.startswith(
                '---\n'
                'name: worktree-integrate\n'
                'description: Use when implementation in a named Git worktree is complete'
            )
        )
        self.assertIn('## Review Mode (Default)', content)
        self.assertIn('## Commit Mode (Explicit Only)', content)
        self.assertIn('HEAD and index unchanged', content)
        self.assertIn('three-way merge', content)
        self.assertIn('downgrade to review mode', content)
        self.assertIn('Keep the task branch and worktree', content)
        self.assertIn('confirmed task-owned uncommitted changes', normalized_content)
        self.assertIn('Git common directory', normalized_content)
        self.assertIn('rebase again before transfer', normalized_content)
        self.assertIn('keep the returned working-tree result', normalized_content)
        self.assertIn('creation ownership', normalized_content)
        self.assertIn('platform or host', normalized_content)
        self.assertIn('git merge --ff-only', content)
        self.assertIn('superpowers:finishing-a-development-branch', content)
        self.assertIn('superpowers:using-git-worktrees', rule)
        self.assertIn('worktree-environment-setup', rule)
        self.assertIn('worktree-integrate', rule)
        self.assertIn('superpowers:finishing-a-development-branch', rule)
        self.assertNotIn('Assume `master`', rule)
        self.assertNotIn('project-development-workflow', rule)

    def test_setup_project_agents_uses_public_archive_without_local_source_or_cache(self):
        content = (REPO_SKILL_ROOT / 'SKILL.md').read_text(encoding='utf-8')
        public_config = sync.load_json(REPO_REFERENCES / 'public_assets.json')

        self.assertIn('always fetches the configured public GitHub archive', content)
        self.assertNotIn('`--source', content)
        self.assertIn('source_repo', public_config)
        self.assertNotIn('source_default', public_config)
        self.assertNotIn('source_cache_dir', public_config)

    def test_sync_preserves_target_specific_worktree_environment_setup(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            source_skill = source / '.agents' / 'skills' / 'worktree-environment-setup'
            target_skill = target / '.agents' / 'skills' / 'worktree-environment-setup'
            source_skill.mkdir(parents=True)
            target_skill.mkdir(parents=True)
            skill_root.mkdir(parents=True)
            (source_skill / 'SKILL.md').write_text(
                '---\nname: worktree-environment-setup\ndescription: Generator contract\n---\n',
                encoding='utf-8',
            )
            existing = (
                '---\n'
                'name: worktree-environment-setup\n'
                'description: Target environment setup\n'
                '---\n\n'
                'Target-specific environment setup.\n'
            )
            (target_skill / 'SKILL.md').write_text(existing, encoding='utf-8')
            public_config = {
                'mirror_delete': True,
                'rules': [],
                'skills': [],
                'project_skill_generators': [{'name': 'worktree-environment-setup'}],
                'agent_prompts': [],
            }
            context = sync.SyncContext(target, source, skill_root, False, [])

            changes = sync.sync_public_assets(context, public_config, {'rules': [], 'agent_prompts': []})

            self.assertEqual((target_skill / 'SKILL.md').read_text(encoding='utf-8'), existing)
            self.assertNotIn(
                sync.Change('updated', '.agents/skills/worktree-environment-setup/SKILL.md'),
                changes,
            )

    def test_discover_local_agent_description_from_referenced_skill(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            target = root / 'target'
            agents_root = target / '.agents' / 'agents'
            skill_root = target / '.agents' / 'skills' / 'dart-verify'
            agents_root.mkdir(parents=True)
            skill_root.mkdir(parents=True)
            (agents_root / 'dart-verify.md').write_text(
                'Apply @.agents/skills/dart-verify/SKILL.md\n',
                encoding='utf-8',
            )
            (skill_root / 'SKILL.md').write_text(
                '---\n'
                'name: dart-verify\n'
                'description: Dart and Flutter verification specialist.\n'
                '---\n',
                encoding='utf-8',
            )

            result = sync.discover_local_assets(target, {'rules': [], 'agent_prompts': []})

        self.assertEqual(
            result['agent_prompts'],
            [
                {
                    'name': 'dart-verify',
                    'description': 'Dart and Flutter verification specialist.',
                    'model': 'sonnet',
                }
            ],
        )

    def test_discover_local_agent_description_falls_back_when_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            target = root / 'target'
            agents_root = target / '.agents' / 'agents'
            agents_root.mkdir(parents=True)
            (agents_root / 'project-agent.md').write_text('Apply @.agents/skills/missing/SKILL.md\n', encoding='utf-8')

            result = sync.discover_local_assets(target, {'rules': [], 'agent_prompts': []})

        self.assertEqual(
            result['agent_prompts'],
            [{'name': 'project-agent', 'description': 'Project-local agent: project-agent', 'model': 'sonnet'}],
        )

    def test_empty_cursor_globs_are_normalized_before_wrapper_rendering(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            templates = skill_root / 'assets' / 'templates'
            rules_root = target / '.agents' / 'rules'
            cursor_root = target / '.cursor' / 'rules'
            (source / '.agents' / 'rules').mkdir(parents=True)
            templates.mkdir(parents=True)
            rules_root.mkdir(parents=True)
            cursor_root.mkdir(parents=True)
            for template in REPO_TEMPLATES.glob('*'):
                shutil.copy2(template, templates / template.name)
            (rules_root / '20-project-tools.md').write_text('Strength: Mandatory\n', encoding='utf-8')
            (cursor_root / '20-project-tools.mdc').write_text(
                '---\n'
                'description: "[mandatory] Project tools"\n'
                'globs: \n'
                'alwaysApply: true\n'
                '---\n\n'
                'Apply @.agents/rules/20-project-tools.md\n',
                encoding='utf-8',
            )
            public_config = {
                'mirror_delete': True,
                'rules': [],
                'skills': [],
                'agent_prompts': [],
                'platforms': {
                    'rule_wrappers': [
                        {
                            'template': 'rule_wrapper.cursor.mdc',
                            'path': '.cursor/rules/{{rule.name}}.mdc',
                        },
                    ],
                    'agent_wrappers': [],
                },
            }
            local_config = sync.discover_local_assets(target, public_config)
            context = sync.SyncContext(target, source, skill_root, False, [])

            sync.sync_public_assets(context, public_config, local_config)

            self.assertIn(
                'globs: ""',
                (cursor_root / '20-project-tools.mdc').read_text(encoding='utf-8'),
            )

    def test_entry_docs_route_project_asset_details_to_placeholders(self):
        readme = (REPO_ROOT / 'README.md').read_text(encoding='utf-8')
        if 'Shared agent configuration for projects that use `.agents/` rules' not in readme:
            self.skipTest('target repositories replace public placeholders with local project facts')
        update_skill = (REPO_SKILL_ROOT / 'SKILL.md').read_text(encoding='utf-8')
        project_rule = (REPO_ROOT / '.agents' / 'rules' / '20-project-tools.md').read_text(encoding='utf-8')
        project_skill = (
            REPO_ROOT
            / '.agents'
            / 'skills'
            / 'worktree-environment-setup'
            / 'SKILL.md'
        ).read_text(encoding='utf-8')

        self.assertNotIn('Local Project Rule Authoring Guide', readme)
        self.assertNotIn('Local Project Skill Authoring Guide', readme)
        self.assertNotIn('## Local Project Assets', update_skill)
        self.assertNotIn('## Local Project Skills', update_skill)
        self.assertIn('## Generation Contract', project_rule)
        self.assertIn('## Generation Contract', project_skill)

    def test_render_template_replaces_nested_variables(self):
        result = sync.render_template(
            'Apply @{{rule.path}}\n',
            {'rule': {'path': '.agents/rules/10-base-code.md'}},
            'sample',
        )

        self.assertEqual(result, 'Apply @.agents/rules/10-base-code.md\n')

    def test_render_template_rejects_missing_variable(self):
        with self.assertRaises(sync.SyncError) as error:
            sync.render_template('Apply @{{rule.path}}\n', {'rule': {}}, 'sample')

        self.assertIn('sample', str(error.exception))
        self.assertIn('rule.path', str(error.exception))

    def test_check_mode_does_not_write(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            skill_root = target / '.agents' / 'skills' / 'setup-project-agents'
            (source / '.agents' / 'rules').mkdir(parents=True)
            skill_root.mkdir(parents=True)
            (source / '.agents' / 'rules' / '10-base-code.md').write_text('rule\n', encoding='utf-8')
            public_config = {
                'mirror_delete': True,
                'rules': [{'file': '10-base-code.md'}],
                'skills': [],
                'agent_prompts': [],
            }
            context = sync.SyncContext(target, source, skill_root, True, [])

            changes = sync.sync_public_assets(context, public_config, {'rules': [], 'agent_prompts': []})

            self.assertEqual(changes, [sync.Change('created', '.agents/rules/10-base-code.md')])
            self.assertFalse((target / '.agents' / 'rules' / '10-base-code.md').exists())

    def test_main_check_returns_one_when_changes_are_needed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / 'agents'
            target = root / 'target'
            source.mkdir()
            shutil.copytree(REPO_ROOT / '.agents', source / '.agents')
            target.mkdir()
            previous_cwd = Path.cwd()
            stdout = io.StringIO()
            public_config = {
                'mirror_delete': True,
                'rules': [{'file': '00-global-rule-config.md'}],
                'skills': [],
                'agent_prompts': [],
            }
            try:
                os.chdir(target)
                with mock.patch.object(
                    sync,
                    'load_json',
                    return_value=public_config,
                ), mock.patch.object(
                    sync,
                    'resolve_source',
                    return_value=source,
                ), contextlib.redirect_stdout(stdout):
                    exit_code = sync.main(['--check'])
            finally:
                os.chdir(previous_cwd)

        self.assertEqual(exit_code, 1)

    def test_main_check_returns_zero_for_unchanged_only_changes(self):
        stdout = io.StringIO()
        public_config = {
            'mirror_delete': True,
            'rules': [],
            'skills': [],
            'agent_prompts': [],
        }
        local_config = {'rules': [], 'agent_prompts': []}
        with mock.patch.object(
            sync,
            'sync_public_assets',
            return_value=[sync.Change('unchanged', '.agents/rules/10-base-code.md')],
        ), mock.patch.object(
            sync,
            'load_json',
            return_value=public_config,
        ), mock.patch.object(
            sync,
            'discover_local_assets',
            return_value=local_config,
        ), mock.patch.object(
            sync,
            'resolve_source',
            return_value=Path('/tmp/agents'),
        ), mock.patch.object(
            sync.Path,
            'cwd',
            return_value=Path('/tmp/target'),
        ), contextlib.redirect_stdout(stdout):
            exit_code = sync.main(['--check'])

        self.assertEqual(exit_code, 0)
        self.assertEqual(stdout.getvalue().strip(), 'unchanged .agents/rules/10-base-code.md')

    def test_main_check_returns_one_for_drift_changes(self):
        stdout = io.StringIO()
        public_config = {
            'mirror_delete': True,
            'rules': [],
            'skills': [],
            'agent_prompts': [],
        }
        local_config = {'rules': [], 'agent_prompts': []}
        with mock.patch.object(
            sync,
            'sync_public_assets',
            return_value=[sync.Change('created', '.agents/rules/10-base-code.md')],
        ), mock.patch.object(
            sync,
            'load_json',
            return_value=public_config,
        ), mock.patch.object(
            sync,
            'discover_local_assets',
            return_value=local_config,
        ), mock.patch.object(
            sync,
            'resolve_source',
            return_value=Path('/tmp/agents'),
        ), mock.patch.object(
            sync.Path,
            'cwd',
            return_value=Path('/tmp/target'),
        ), contextlib.redirect_stdout(stdout):
            exit_code = sync.main(['--check'])

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue().strip(), 'created .agents/rules/10-base-code.md')

    def test_discover_local_assets_preserves_project_specific_rules_and_agents(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            target = root / 'target'
            rules_root = target / '.agents' / 'rules'
            agents_root = target / '.agents' / 'agents'
            rules_root.mkdir(parents=True)
            agents_root.mkdir(parents=True)
            (rules_root / '00-global-rule-config.md').write_text('Strength: Mandatory\n', encoding='utf-8')
            (rules_root / '30-module-common.md').write_text('Strength: Advisory\n', encoding='utf-8')
            (agents_root / 'project-agent.md').write_text(
                '---\nname: project-agent\ndescription: Project reviewer\nmodel: sonnet\n---\n',
                encoding='utf-8',
            )
            public_config = {
                'rules': [{'file': '00-global-rule-config.md'}],
                'agent_prompts': [],
            }

            result = sync.discover_local_assets(target, public_config)

        self.assertEqual(
            result['rules'],
            [
                {
                    'file': '30-module-common.md',
                    'read_when': 'Project-local rule applies',
                    'strength': 'Advisory',
                    'section': 'project',
                    'cursor': {
                        'description': '[project] 30-module-common',
                        'globs': '""',
                        'alwaysApply': True,
                    },
                    'claude': {'paths': []},
                    'github': {'applyTo': '**'},
                }
            ],
        )
        self.assertEqual(
            result['agent_prompts'],
            [{'name': 'project-agent', 'description': 'Project reviewer', 'model': 'sonnet'}],
        )

    def test_discover_local_assets_preserves_existing_rule_metadata(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            target = root / 'target'
            rules_root = target / '.agents' / 'rules'
            cursor_root = target / '.cursor' / 'rules'
            claude_root = target / '.claude' / 'rules'
            github_root = target / '.github' / 'instructions'
            rules_root.mkdir(parents=True)
            cursor_root.mkdir(parents=True)
            claude_root.mkdir(parents=True)
            github_root.mkdir(parents=True)
            (target / 'AGENTS.md').write_text(
                '| Read when | Rule | Strength |\n'
                '| --- | --- | --- |\n'
                '| Working with module common widgets | `.agents/rules/30-module-common.md` |'
                ' `Advisory` |\n',
                encoding='utf-8',
            )
            (rules_root / '30-module-common.md').write_text('Strength: Default\n', encoding='utf-8')
            (cursor_root / '30-module-common.mdc').write_text(
                '---\n'
                'description: "[module] common widgets"\n'
                'globs: "common/**"\n'
                'alwaysApply: false\n'
                '---\n\n'
                'Apply @.agents/rules/30-module-common.md\n',
                encoding='utf-8',
            )
            (claude_root / '30-module-common.md').write_text(
                '---\npaths:\n  - "common/**"\n---\n\nApply @.agents/rules/30-module-common.md\n',
                encoding='utf-8',
            )
            (github_root / '30-module-common.instructions.md').write_text(
                '---\napplyTo: "common/**"\n---\n\nApply @.agents/rules/30-module-common.md\n',
                encoding='utf-8',
            )
            public_config = {'rules': [], 'agent_prompts': []}

            result = sync.discover_local_assets(target, public_config)

        self.assertEqual(
            result['rules'],
            [
                {
                    'file': '30-module-common.md',
                    'read_when': 'Working with module common widgets',
                    'strength': 'Advisory',
                    'section': 'project',
                    'cursor': {
                        'description': '[module] common widgets',
                        'globs': 'common/**',
                        'alwaysApply': False,
                    },
                    'claude': {'paths': ['common/**']},
                    'github': {'applyTo': 'common/**'},
                }
            ],
        )


if __name__ == '__main__':
    unittest.main()
