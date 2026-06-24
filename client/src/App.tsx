import { BookOpen, Brush, Languages, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fallbackConfig,
  createFusion,
  createGeneration,
  getRecord,
  getJob,
  isGenerationLimitError,
  loadActiveJobs,
  loadLibrary,
  loadPublicConfig,
  uploadPhoto,
  updateFavorite,
  type GenerationJob,
  type GenerationRecord,
  type GenerationStartResult,
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

const LOCALE_KEY = "inkspire.locale";
const ACTIVE_TAB_KEY = "inkspire.activeTab";
const CURRENT_RECORD_KEY = "inkspire.currentRecordId";

const tabIcons = {
  studio: Brush,
  library: BookOpen,
  experts: Users
};

function visibleLibraryRecords(records: LibraryRecord[]): LibraryRecord[] {
  return records.filter((record) => record.favorite !== false);
}

function isLocale(value: string | null): value is Locale {
  return value === "zh-Hans" || value === "zh-Hant" || value === "en";
}

function isTab(value: string | null): value is Tab {
  return value === "studio" || value === "library" || value === "experts";
}

function readStoredLocale(defaultLocale: Locale): Locale {
  if (typeof window === "undefined") {
    return defaultLocale;
  }
  const stored = window.localStorage.getItem(LOCALE_KEY);
  return isLocale(stored) ? stored : defaultLocale;
}

function readStoredTab(): Tab {
  if (typeof window === "undefined") {
    return "studio";
  }
  const stored = window.localStorage.getItem(ACTIVE_TAB_KEY);
  return isTab(stored) ? stored : "studio";
}

function readStoredRecordId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(CURRENT_RECORD_KEY) ?? "";
}

export default function App() {
  const [config, setConfig] = useState<PublicConfig>(fallbackConfig);
  const [locale, setLocale] = useState<Locale>(() => readStoredLocale(fallbackConfig.defaultLocale ?? "zh-Hans"));
  const [activeTab, setActiveTab] = useState<Tab>(() => readStoredTab());
  const [library, setLibrary] = useState<LibraryRecord[]>([]);
  const [currentRecord, setCurrentRecord] = useState<GenerationRecord | null>(null);
  const [activeJobs, setActiveJobs] = useState<GenerationJob[]>([]);
  const [restoringRecordId, setRestoringRecordId] = useState(() => readStoredRecordId());
  const [showProduction, setShowProduction] = useState(false);
  const [isAttachingPhoto, setIsAttachingPhoto] = useState(false);
  const [resultActionError, setResultActionError] = useState("");
  const [notesFocusRequest, setNotesFocusRequest] = useState(0);
  const activeJobsRef = useRef<GenerationJob[]>([]);
  const autoFusionRecordIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadPublicConfig().then((nextConfig) => {
      setConfig(nextConfig);
      setLocale((currentLocale) => {
        const stored = typeof window !== "undefined" ? window.localStorage.getItem(LOCALE_KEY) : null;
        return isLocale(stored) ? currentLocale : nextConfig.defaultLocale ?? "zh-Hans";
      });
    });
    loadLibrary().then((records) => setLibrary(visibleLibraryRecords(records)));
    loadActiveJobs().then((jobs) => setActiveJobs(jobs)).catch(() => {});
  }, []);

  useEffect(() => {
    activeJobsRef.current = activeJobs;
  }, [activeJobs]);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!restoringRecordId) {
      return;
    }
    let active = true;
    getRecord(restoringRecordId)
      .then((record) => {
        if (!active) {
          return;
        }
        setCurrentRecord(record);
      })
      .catch(() => {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(CURRENT_RECORD_KEY);
        }
      })
      .finally(() => {
        if (active) {
          setRestoringRecordId("");
        }
      });
    return () => {
      active = false;
    };
  }, [restoringRecordId]);

  const t = useMemo(() => createTranslator(locale, config.i18n), [config.i18n, locale]);
  const list = useMemo(() => createListTranslator(locale, config.i18n), [config.i18n, locale]);

  const onResult = useCallback((record: GenerationRecord) => {
    setCurrentRecord(record);
    setNotesFocusRequest(0);
    if (record.id) {
      window.localStorage.setItem(CURRENT_RECORD_KEY, record.id);
    }
    setLibrary((records) => {
      const withoutDuplicate = records.filter((item) => item.id !== record.id);
      return visibleLibraryRecords([record, ...withoutDuplicate]);
    });
  }, []);

  const mergeActiveJob = useCallback((job: GenerationJob) => {
    setActiveJobs((jobs) => {
      const next = [job, ...jobs.filter((item) => item.id !== job.id)]
        .filter((item) => item.status === "queued" || item.status === "running")
        .slice(0, 2);
      activeJobsRef.current = next;
      return next;
    });
  }, []);

  const replaceActiveJobs = useCallback((jobs: GenerationJob[]) => {
    const next = jobs
      .filter((job) => job.status === "queued" || job.status === "running")
      .slice(0, 2);
    activeJobsRef.current = next;
    setActiveJobs(next);
  }, []);

  const handleGenerationStart = useCallback((result: GenerationStartResult) => {
    if (result.limitReached) {
      replaceActiveJobs(result.activeJobs ?? []);
      const error = new Error(result.code || "generation limit reached");
      Object.assign(error, {
        status: 429,
        payload: result
      });
      throw error;
    }
    if (result.job?.status === "queued" || result.job?.status === "running") {
      mergeActiveJob(result.job);
    }
  }, [mergeActiveJob, replaceActiveJobs]);

  const applyFinishedRecord = useCallback((record: GenerationRecord) => {
    onResult(record);
  }, [onResult]);

  const startFusionJob = useCallback(async (recordId: string, sourcePhotoPath = "") => {
    try {
      const result = await createFusion(recordId, sourcePhotoPath);
      handleGenerationStart(result);
      if (result.record && (!result.job || result.job.status === "succeeded" || result.job.status === "failed")) {
        applyFinishedRecord(result.record);
      }
      if (result.job?.status === "failed") {
        throw new Error(result.job.error || "fusion generation failed");
      }
    } catch (error) {
      if (isGenerationLimitError(error)) {
        replaceActiveJobs((error.payload as GenerationStartResult).activeJobs ?? []);
      }
      throw error;
    }
  }, [applyFinishedRecord, handleGenerationStart, replaceActiveJobs]);

  const startGenerationJob = useCallback(async (payload: Parameters<typeof createGeneration>[0]) => {
    try {
      const result = await createGeneration(payload);
      handleGenerationStart(result);
      if (result.record && !result.job) {
        if (
          result.record.status === "succeeded"
          && payload.source_photo_path
          && result.record.source_photo_path
          && !result.record.fusion_path
          && !autoFusionRecordIds.current.has(result.record.id)
        ) {
          autoFusionRecordIds.current.add(result.record.id);
          await startFusionJob(result.record.id, result.record.source_photo_path);
          return;
        }
        applyFinishedRecord(result.record);
      }
    } catch (error) {
      if (isGenerationLimitError(error)) {
        replaceActiveJobs((error.payload as GenerationStartResult).activeJobs ?? []);
      }
      throw error;
    }
  }, [applyFinishedRecord, handleGenerationStart, replaceActiveJobs, startFusionJob]);

  const completeJob = useCallback(async (job: GenerationJob) => {
    const record = await getRecord(job.recordId);
    if (
      job.stage === "artwork"
      && record.status === "succeeded"
      && record.source_photo_path
      && !record.fusion_path
      && !autoFusionRecordIds.current.has(record.id)
    ) {
      autoFusionRecordIds.current.add(record.id);
      await startFusionJob(record.id, record.source_photo_path);
      return;
    }
    applyFinishedRecord(record);
  }, [applyFinishedRecord, startFusionJob]);

  const pollActiveJobs = useCallback(async () => {
    const currentJobs = activeJobsRef.current;
    if (currentJobs.length === 0) {
      return;
    }
    const completedIds = new Set<string>();
    const updates = new Map<string, GenerationJob>();

    await Promise.all(currentJobs.map(async (job) => {
      try {
        const nextJob = await getJob(job.id);
        if (nextJob.status === "queued" || nextJob.status === "running") {
          updates.set(nextJob.id, nextJob);
          return;
        }
        completedIds.add(nextJob.id);
        await completeJob(nextJob);
      } catch {
        completedIds.add(job.id);
      }
    }));

    setActiveJobs((jobs) => {
      const next = jobs
        .filter((job) => !completedIds.has(job.id))
        .map((job) => updates.get(job.id) ?? job)
        .filter((job) => job.status === "queued" || job.status === "running")
        .slice(0, 2);
      activeJobsRef.current = next;
      return next;
    });
  }, [completeJob]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void pollActiveJobs();
    }, 1500);
    void pollActiveJobs();
    return () => window.clearInterval(timer);
  }, [pollActiveJobs]);

  const clearCurrentRecord = () => {
    setCurrentRecord(null);
    window.localStorage.removeItem(CURRENT_RECORD_KEY);
    setRestoringRecordId("");
    setShowProduction(false);
    setResultActionError("");
  };

  const resultSlot = currentRecord ? (
    <ResultView
      record={currentRecord}
      artworkLabel={t("result.artwork")}
      fusionLabel={t("result.fusion")}
      makeLabel={t("buttons.make")}
      makeHint={t("result.makeHint")}
      continueLabel={t("result.continue")}
      addNotesLabel={t("result.addNotes")}
      attachPhotoLabel={t("result.attachPhotoFusion")}
      busyLabel={t("studio.generating")}
      failedTitle={t("result.failedTitle")}
      failedHint={t("result.failedHint")}
      imageUnavailableTitle={t("result.imageUnavailableTitle")}
      imageUnavailableHint={t("result.imageUnavailableHint")}
      fusionUnavailableTitle={t("result.fusionUnavailableTitle")}
      fusionUnavailableHint={t("result.fusionUnavailableHint")}
      actionError={resultActionError}
      isAttachingPhoto={isAttachingPhoto}
      onMake={() => setShowProduction(true)}
      onContinue={() => {
        clearCurrentRecord();
        setNotesFocusRequest((request) => request + 1);
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
          await startFusionJob(currentRecord.id, upload.source_photo_path);
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
        <div className="topbar-title">
          <h1>墨起</h1>
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
            onStartGeneration={startGenerationJob}
            activeJobs={activeJobs}
            resultSlot={resultSlot}
            notesFocusRequest={notesFocusRequest}
            hasResult={Boolean(currentRecord)}
            onStartOver={clearCurrentRecord}
          />
        ) : null}
        {activeTab === "library" ? (
          <Library
            records={library}
            emptyLabel={t("empty.library")}
            emptyHint={t("empty.libraryHint")}
            emptyActionLabel={t("empty.libraryAction")}
            labels={{
              artwork: t("library.artwork"),
              fusion: t("library.fusion"),
              failed: t("library.failed"),
              openRecord: t("library.openRecord"),
              removeFavorite: t("library.removeFavorite"),
              removeFavoriteShort: t("library.removeFavoriteShort"),
              removeConfirmTitle: t("library.removeConfirmTitle"),
              removeConfirmHint: t("library.removeConfirmHint"),
              removeConfirmCancel: t("library.removeConfirmCancel"),
              removeConfirmAction: t("library.removeConfirmAction")
            }}
            onEmptyAction={() => setActiveTab("studio")}
            onOpen={async (record) => {
              setResultActionError("");
              try {
                const fullRecord = await getRecord(record.id);
                onResult(fullRecord);
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
          <Experts
            experts={config.experts}
            title={t("experts.title")}
            locale={locale}
            serviceHeading={t("experts.serviceHeading")}
            extraServiceName={t("experts.extraServiceName")}
            extraServiceDescription={t("experts.extraServiceDescription")}
            expectationLabel={t("experts.expectation")}
            sampleHeading={t("experts.sampleHeading")}
            currentWorkLabel={t("experts.currentWork")}
            currentWorkPreviewLabel={t("experts.currentWorkPreview")}
            ctaLabel={currentRecord ? t("experts.ctaWithRecord") : t("experts.ctaStart")}
            currentRecord={currentRecord}
            onCta={() => {
              setActiveTab("studio");
              if (currentRecord && currentRecord.status !== "failed") {
                setShowProduction(true);
              }
            }}
          />
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
          record={currentRecord}
          title={t("production.title")}
          introLabel={t("production.intro")}
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
