import { BookOpen, Brush, Languages, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  fallbackConfig,
  createFusion,
  getRecord,
  loadLibrary,
  loadPublicConfig,
  uploadPhoto,
  updateFavorite,
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

function visibleLibraryRecords(records: LibraryRecord[]): LibraryRecord[] {
  return records.filter((record) => record.favorite !== false);
}

export default function App() {
  const [config, setConfig] = useState<PublicConfig>(fallbackConfig);
  const [locale, setLocale] = useState<Locale>(fallbackConfig.defaultLocale ?? "zh-Hans");
  const [activeTab, setActiveTab] = useState<Tab>("studio");
  const [library, setLibrary] = useState<LibraryRecord[]>([]);
  const [currentRecord, setCurrentRecord] = useState<GenerationRecord | null>(null);
  const [showProduction, setShowProduction] = useState(false);
  const [isAttachingPhoto, setIsAttachingPhoto] = useState(false);
  const [resultActionError, setResultActionError] = useState("");
  const [notesFocusRequest, setNotesFocusRequest] = useState(0);

  useEffect(() => {
    loadPublicConfig().then((nextConfig) => {
      setConfig(nextConfig);
      setLocale(nextConfig.defaultLocale ?? "zh-Hans");
    });
    loadLibrary().then((records) => setLibrary(visibleLibraryRecords(records)));
  }, []);

  const t = useMemo(() => createTranslator(locale, config.i18n), [config.i18n, locale]);
  const list = useMemo(() => createListTranslator(locale, config.i18n), [config.i18n, locale]);

  const onResult = (record: GenerationRecord) => {
    setCurrentRecord(record);
    setLibrary((records) => {
      const withoutDuplicate = records.filter((item) => item.id !== record.id);
      return visibleLibraryRecords([record, ...withoutDuplicate]);
    });
  };

  const resultSlot = currentRecord ? (
    <ResultView
      record={currentRecord}
      artworkLabel={t("result.artwork")}
      fusionLabel={t("result.fusion")}
      makeLabel={t("buttons.make")}
      continueLabel={t("result.continue")}
      addNotesLabel={t("result.addNotes")}
      attachPhotoLabel={t("result.attachPhotoFusion")}
      busyLabel={t("studio.generating")}
      failedTitle={t("result.failedTitle")}
      failedHint={t("result.failedHint")}
      actionError={resultActionError}
      isAttachingPhoto={isAttachingPhoto}
      onMake={() => setShowProduction(true)}
      onContinue={() => {
        setCurrentRecord(null);
        setShowProduction(false);
        setResultActionError("");
      }}
      onAddNotes={() => {
        setActiveTab("studio");
        setNotesFocusRequest((request) => request + 1);
      }}
      onAttachPhoto={async (file) => {
        if (!currentRecord?.id) {
          return;
        }
        setIsAttachingPhoto(true);
        setResultActionError("");
        try {
          const upload = await uploadPhoto(file);
          onResult(await createFusion(currentRecord.id, upload.source_photo_path));
        } catch {
          setResultActionError(t("errors.generic"));
        } finally {
          setIsAttachingPhoto(false);
        }
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
          <span className="language-select-label">{t("language.label")}</span>
          <select
            aria-label={t("language.label")}
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
          >
            <option value="zh-Hans">简</option>
            <option value="zh-Hant">繁</option>
            <option value="en">EN</option>
          </select>
        </label>
      </header>

      <main className="main-surface">
        {activeTab === "studio" ? (
          <Studio
            config={config}
            locale={locale}
            t={t}
            list={list}
            onResult={onResult}
            resultSlot={resultSlot}
            notesFocusRequest={notesFocusRequest}
          />
        ) : null}
        {activeTab === "library" ? (
          <Library
            records={library}
            emptyLabel={t("empty.library")}
            labels={{
              artwork: t("library.artwork"),
              fusion: t("library.fusion"),
              failed: t("library.failed"),
              removeFavorite: t("library.removeFavorite")
            }}
            onOpen={async (record) => {
              setResultActionError("");
              try {
                const fullRecord = await getRecord(record.id);
                setCurrentRecord(fullRecord);
                setActiveTab("studio");
              } catch {
                setResultActionError(t("errors.generic"));
              }
            }}
            onFavoriteToggle={async (record, favorite) => {
              await updateFavorite(record.id, favorite);
              setLibrary((records) => visibleLibraryRecords(
                records.map((item) => item.id === record.id ? { ...item, favorite } : item)
              ));
            }}
          />
        ) : null}
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
          supportContact={config.productionContact}
          locale={locale}
          recordId={currentRecord.id}
          title={t("production.title")}
          closeLabel={t("production.close")}
          sizeLabel={t("production.size")}
          estimateLabel={t("production.estimate")}
          contactLabel={t("production.contact")}
          phoneLabel={t("production.phone")}
          wechatLabel={t("production.wechat")}
          confirmLabel={t("production.confirm")}
          contactPendingLabel={t("experts.contactPending")}
          onClose={() => setShowProduction(false)}
        />
      ) : null}
    </div>
  );
}
