import { BookOpen, Brush, Languages, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  fallbackConfig,
  loadLibrary,
  loadPublicConfig,
  type GenerationRecord,
  type LibraryRecord,
  type PublicConfig
} from "./api";
import Experts from "./components/Experts";
import Library from "./components/Library";
import ParticleBackdrop from "./components/ParticleBackdrop";
import ProductionDialog from "./components/ProductionDialog";
import ResultView from "./components/ResultView";
import Studio from "./components/Studio";
import type { Locale } from "./domain";
import { createListTranslator, createTranslator } from "./i18n";

type Tab = "studio" | "library" | "experts";

const tabIcons = {
  studio: Brush,
  library: BookOpen,
  experts: Users
};

export default function App() {
  const [config, setConfig] = useState<PublicConfig>(fallbackConfig);
  const [locale, setLocale] = useState<Locale>(fallbackConfig.defaultLocale ?? "zh-Hans");
  const [activeTab, setActiveTab] = useState<Tab>("studio");
  const [library, setLibrary] = useState<LibraryRecord[]>([]);
  const [currentRecord, setCurrentRecord] = useState<GenerationRecord | null>(null);
  const [showProduction, setShowProduction] = useState(false);

  useEffect(() => {
    loadPublicConfig().then((nextConfig) => {
      setConfig(nextConfig);
      setLocale(nextConfig.defaultLocale ?? "zh-Hans");
    });
    loadLibrary().then(setLibrary);
  }, []);

  const t = useMemo(() => createTranslator(locale, config.i18n), [config.i18n, locale]);
  const list = useMemo(() => createListTranslator(locale, config.i18n), [config.i18n, locale]);

  const onResult = (record: GenerationRecord) => {
    setCurrentRecord(record);
    setLibrary((records) => {
      const withoutDuplicate = records.filter((item) => item.id !== record.id);
      return [record, ...withoutDuplicate];
    });
  };

  const resultSlot = currentRecord ? (
    <ResultView
      record={currentRecord}
      artworkLabel={t("result.artwork")}
      fusionLabel={t("result.fusion")}
      makeLabel={t("buttons.make")}
      continueLabel={t("result.continue")}
      failedTitle={t("result.failedTitle")}
      failedHint={t("result.failedHint")}
      onMake={() => setShowProduction(true)}
      onContinue={() => {
        setCurrentRecord(null);
        setShowProduction(false);
      }}
    />
  ) : null;

  return (
    <div className="app-shell">
      <ParticleBackdrop />
      <header className="topbar">
        <div>
          <strong>墨起</strong>
          <span>{t("studio.subtitle")}</span>
        </div>
        <label className="language-select">
          <Languages aria-hidden="true" size={16} />
          <span>语言</span>
          <select aria-label="语言" value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
            <option value="zh-Hans">简</option>
            <option value="zh-Hant">繁</option>
            <option value="en">EN</option>
          </select>
        </label>
      </header>

      <main className="main-surface">
        {activeTab === "studio" ? (
          <Studio config={config} locale={locale} t={t} list={list} onResult={onResult} resultSlot={resultSlot} />
        ) : null}
        {activeTab === "library" ? <Library records={library} emptyLabel={t("empty.library")} /> : null}
        {activeTab === "experts" ? (
          <Experts experts={config.experts} title={t("experts.title")} contactPendingLabel={t("experts.contactPending")} />
        ) : null}
      </main>

      <nav className="bottom-tabs" aria-label="Inkspire">
        {(["studio", "library", "experts"] as Tab[]).map((tab) => {
          const Icon = tabIcons[tab];
          return (
            <button
              key={tab}
              type="button"
              aria-pressed={activeTab === tab}
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              <Icon aria-hidden="true" size={18} />
              {t(`tabs.${tab}`)}
            </button>
          );
        })}
      </nav>

      {showProduction && currentRecord && currentRecord.status !== "failed" ? (
        <ProductionDialog
          expert={config.experts[0]}
          locale={locale}
          recordId={currentRecord.id}
          title={t("production.title")}
          closeLabel={t("production.close")}
          estimateLabel={t("production.estimate")}
          contactLabel={t("production.contact")}
          confirmLabel={t("production.confirm")}
          contactPendingLabel={t("experts.contactPending")}
          onClose={() => setShowProduction(false)}
        />
      ) : null}
    </div>
  );
}
