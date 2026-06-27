import { BookOpen, Brush, Languages, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import {
  fallbackConfig,
  createFusion,
  createGeneration,
  getRecord,
  getJob,
  isGenerationLimitError,
  isPhotoTooLargeError,
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
import AdjustView from "./components/AdjustView";
import Studio from "./components/Studio";
import type { Locale } from "./domain";
import { createListTranslator, createTranslator } from "./i18n";
import {
  backCurrentTab,
  fallbackPathForSource,
  migrateLegacyNavigationPath,
  pathForRecord,
  pushTabRoute,
  readSourceTab,
  readTabHistoryState,
  replaceTabRoute,
  switchTabRoute,
  tabFromPath,
  writeTabHistoryState,
  type Tab
} from "./navigation";

type RecordRouteMode = "result" | "adjust" | "production";

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isKnownTopLevelPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/studio" || pathname === "/library" || pathname === "/experts";
}

function parseRecordRoute(pathname: string): { recordId: string; mode: RecordRouteMode } | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "records" || !parts[1]) {
    return null;
  }
  const decodedRecordId = decodePathSegment(parts[1]);
  if (!decodedRecordId) {
    return null;
  }
  if (parts.length === 2) {
    return { recordId: decodedRecordId, mode: "result" };
  }
  if (parts.length === 3 && (parts[2] === "adjust" || parts[2] === "production")) {
    return { recordId: decodedRecordId, mode: parts[2] };
  }
  return null;
}

const LOCALE_KEY = "inkspire.locale";

const tabIcons = {
  studio: Brush,
  library: BookOpen,
  experts: Users
};

function generationTime(record: LibraryRecord): number {
  const time = record.created_at ? new Date(record.created_at).getTime() : NaN;
  return Number.isNaN(time) ? -Infinity : time;
}

function visibleLibraryRecords(records: LibraryRecord[]): LibraryRecord[] {
  return records
    .filter((record) => record.favorite !== false)
    .sort((a, b) => generationTime(b) - generationTime(a));
}

function maxInputBytes(config: PublicConfig): number {
  return Math.max(1, config.image?.maxInputSizeMb ?? 10) * 1024 * 1024;
}

function hasProductionContact(config: PublicConfig): boolean {
  const expert = config.experts[0];
  return config.productionAvailable !== false && Boolean(
    config.productionContact?.phone
    || config.productionContact?.wechat
    || expert?.phone
    || expert?.wechat
  );
}

function isLocale(value: string | null): value is Locale {
  return value === "zh-Hans" || value === "zh-Hant" || value === "en";
}

function readStoredLocale(defaultLocale: Locale): Locale {
  if (typeof window === "undefined") {
    return defaultLocale;
  }
  const stored = window.localStorage.getItem(LOCALE_KEY);
  return isLocale(stored) ? stored : defaultLocale;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const pathWithSearch = `${location.pathname}${location.search}`;
  const activeTab = tabFromPath(pathWithSearch);
  const recordRoute = parseRecordRoute(location.pathname);
  const [config, setConfig] = useState<PublicConfig>(fallbackConfig);
  const [locale, setLocale] = useState<Locale>(() => readStoredLocale(fallbackConfig.defaultLocale ?? "zh-Hans"));
  const [library, setLibrary] = useState<LibraryRecord[]>([]);
  const [currentRecord, setCurrentRecord] = useState<GenerationRecord | null>(null);
  const [recordViewOpen, setRecordViewOpen] = useState(false);
  const [activeJobs, setActiveJobs] = useState<GenerationJob[]>([]);
  const [restoringRecordId, setRestoringRecordId] = useState("");
  const [showProduction, setShowProduction] = useState(false);
  const [isAttachingPhoto, setIsAttachingPhoto] = useState(false);
  const [resultActionError, setResultActionError] = useState("");
  const [libraryActionError, setLibraryActionError] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState("");
  const [studioResetRequest, setStudioResetRequest] = useState(0);
  const [tabHistory, setTabHistory] = useState(() => readTabHistoryState(
    typeof window === "undefined" ? "/studio" : `${window.location.pathname}${window.location.search}`
  ));
  const activeJobsRef = useRef<GenerationJob[]>([]);
  const autoFusionRecordIds = useRef<Set<string>>(new Set());
  const recordCacheRef = useRef<Map<string, GenerationRecord>>(new Map());
  const adjustSubmitRef = useRef(false);
  const tabHistoryRef = useRef(tabHistory);
  const skipNextPopSyncRef = useRef(false);

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
    tabHistoryRef.current = tabHistory;
    writeTabHistoryState(tabHistory);
  }, [tabHistory]);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    const onPopState = () => {
      skipNextPopSyncRef.current = true;
      const next = backCurrentTab(tabHistoryRef.current);
      setTabHistory(next.state);
      if (next.didGoBack && next.path === "/studio") {
        if (currentRecord?.id) {
          recordCacheRef.current.delete(currentRecord.id);
        }
        setCurrentRecord(null);
        setRestoringRecordId("");
        setShowProduction(false);
        setAdjustOpen(false);
        setRecordViewOpen(false);
        setResultActionError("");
        setLibraryActionError("");
        setStudioResetRequest((request) => request + 1);
      }
      navigate(next.path, { replace: true });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [currentRecord?.id, navigate]);

  useEffect(() => {
    if (location.pathname === "/") {
      navigate(migrateLegacyNavigationPath(), { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (isKnownTopLevelPath(location.pathname) || recordRoute) {
      return;
    }
    navigate("/studio", { replace: true });
  }, [location.pathname, navigate, recordRoute]);

  useEffect(() => {
    if (!isKnownTopLevelPath(location.pathname) && !recordRoute) {
      return;
    }
    if (skipNextPopSyncRef.current && navigationType === "POP") {
      skipNextPopSyncRef.current = false;
      return;
    }
    setTabHistory((current) => (
      navigationType === "REPLACE"
        ? replaceTabRoute(current, pathWithSearch)
        : pushTabRoute(current, pathWithSearch)
    ));
  }, [location.pathname, navigationType, pathWithSearch, recordRoute?.mode, recordRoute?.recordId]);

  useEffect(() => {
    if (!recordRoute) {
      setAdjustOpen(false);
      setShowProduction(false);
      setRecordViewOpen(false);
      return;
    }
    const { recordId, mode } = recordRoute;
    const source = readSourceTab(location.search);
    setResultActionError("");
    setLibraryActionError("");
    setAdjustError("");
    setRecordViewOpen(true);
    setAdjustOpen(mode === "adjust");
    setShowProduction(mode === "production");

    const cached = recordCacheRef.current.get(recordId);
    if (cached) {
      setCurrentRecord(cached);
      setRestoringRecordId("");
      return;
    }

    let active = true;
    setRestoringRecordId(recordId);
    getRecord(recordId)
      .then((record) => {
        if (!active) {
          return;
        }
        recordCacheRef.current.set(record.id, record);
        setCurrentRecord(record);
        setRestoringRecordId("");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setCurrentRecord(null);
        setRecordViewOpen(false);
        setAdjustOpen(false);
        setShowProduction(false);
        setRestoringRecordId("");
        navigate(fallbackPathForSource(source), { replace: true });
      });
    return () => {
      active = false;
    };
  }, [activeTab, location.search, navigate, recordRoute?.mode, recordRoute?.recordId]);

  const t = useMemo(() => createTranslator(locale, config.i18n), [config.i18n, locale]);
  const list = useMemo(() => createListTranslator(locale, config.i18n), [config.i18n, locale]);
  const productionEnabled = hasProductionContact(config);

  const onResult = useCallback((record: GenerationRecord) => {
    recordCacheRef.current.set(record.id, record);
    setCurrentRecord(record);
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
    const finishingAdjustment = adjustSubmitRef.current;
    const shouldOpenResult = activeTab === "studio" || finishingAdjustment;
    setRecordViewOpen(shouldOpenResult);
    const source = readSourceTab(location.search);
    if (finishingAdjustment) {
      adjustSubmitRef.current = false;
      setAdjustOpen(false);
      navigate(pathForRecord(record.id, source), { replace: true });
      return;
    }
    const nextSource = recordRoute?.recordId === record.id ? source : "studio";
    navigate(pathForRecord(record.id, nextSource), { replace: recordRoute?.recordId === record.id });
  }, [activeTab, location.search, navigate, onResult, recordRoute?.recordId]);

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

  const finishRecordForJob = useCallback(async (job: GenerationJob, record: GenerationRecord) => {
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

  const completeJob = useCallback(async (job: GenerationJob) => {
    const record = await getRecord(job.recordId);
    await finishRecordForJob(job, record);
  }, [finishRecordForJob]);

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
        try {
          const record = await getRecord(job.recordId);
          if (record.status === "queued" || record.status === "running") {
            return;
          }
          completedIds.add(job.id);
          await finishRecordForJob(job, record);
        } catch {
          completedIds.add(job.id);
        }
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
  }, [completeJob, finishRecordForJob]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void pollActiveJobs();
    }, 1500);
    void pollActiveJobs();
    return () => window.clearInterval(timer);
  }, [pollActiveJobs]);

  const startNewArtwork = () => {
    if (currentRecord?.id) {
      recordCacheRef.current.delete(currentRecord.id);
    }
    setCurrentRecord(null);
    setRestoringRecordId("");
    setShowProduction(false);
    setAdjustOpen(false);
    setRecordViewOpen(false);
    navigate("/studio");
    setResultActionError("");
    setLibraryActionError("");
    setStudioResetRequest((request) => request + 1);
  };

  const goToTab = (tab: Tab) => {
    if (tab === "studio" && activeTab === "studio" && currentRecord && !adjustOpen && !showProduction) {
      startNewArtwork();
      return;
    }
    if (tab === activeTab && !showProduction && !adjustOpen) {
      return;
    }
    setShowProduction(false);
    setAdjustOpen(false);
    const target = switchTabRoute(tabHistoryRef.current, tab);
    setTabHistory(target.state);
    setResultActionError("");
    setLibraryActionError("");
    navigate(target.path);
  };

  const openRecordFromLibrary = async (record: LibraryRecord) => {
    setResultActionError("");
    setLibraryActionError("");
    try {
      const fullRecord = await getRecord(record.id);
      recordCacheRef.current.set(fullRecord.id, fullRecord);
      onResult(fullRecord);
      setRecordViewOpen(true);
      setAdjustOpen(false);
      setShowProduction(false);
      navigate(pathForRecord(fullRecord.id, "library"));
    } catch {
      setLibraryActionError(t("errors.libraryOpenFailed"));
    }
  };

  const openAdjust = () => {
    if (!currentRecord) {
      return;
    }
    setAdjustError("");
    navigate(pathForRecord(currentRecord.id, readSourceTab(location.search), "adjust"));
  };

  const openProduction = () => {
    if (!currentRecord || currentRecord.status === "failed") {
      return;
    }
    navigate(pathForRecord(currentRecord.id, readSourceTab(location.search), "production"));
  };

  const closeProduction = () => {
    if (!currentRecord) {
      navigate(fallbackPathForSource(activeTab), { replace: true });
      return;
    }
    navigate(pathForRecord(currentRecord.id, readSourceTab(location.search)), { replace: true });
  };

  const navigateBack = () => {
    if (!currentRecord) {
      navigate(fallbackPathForSource(activeTab), { replace: true });
      return;
    }
    navigate(pathForRecord(currentRecord.id, readSourceTab(location.search)), { replace: true });
  };

  const submitAdjustment = async (note: string) => {
    if (!currentRecord) {
      return;
    }
    setIsAdjusting(true);
    setAdjustError("");
    adjustSubmitRef.current = true;
    try {
      await startGenerationJob({
        type: currentRecord.type,
        answers: currentRecord.answers ?? {},
        conversationNotes: note,
        source_photo_path: currentRecord.source_photo_path,
        recommended_artwork_size: currentRecord.recommended_artwork_size ?? null
      });
    } catch (error) {
      adjustSubmitRef.current = false;
      setAdjustError(isGenerationLimitError(error) ? t("studio.generationLimit") : t("errors.generic"));
    } finally {
      setIsAdjusting(false);
    }
  };

  const resultSlot = currentRecord ? (
    <ResultView
      record={currentRecord}
      artworkLabel={t("result.artwork")}
      fusionLabel={t("result.fusion")}
      makeLabel={t("buttons.make")}
      makeHint={t("result.makeHint")}
      adjustLabel={t("result.adjust")}
      adjustRetryLabel={t("result.adjustRetry")}
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
      canMake={productionEnabled}
      onMake={openProduction}
      onAdjust={openAdjust}
      onAttachPhoto={async (file) => {
        if (!currentRecord?.id) {
          return;
        }
        if (file.size > maxInputBytes(config)) {
          setResultActionError(t("errors.photoTooLarge"));
          return;
        }
        setIsAttachingPhoto(true);
        setResultActionError("");
        try {
          const upload = await uploadPhoto(file);
          await startFusionJob(currentRecord.id, upload.source_photo_path);
        } catch (error) {
          setResultActionError(isPhotoTooLargeError(error) ? t("errors.photoTooLarge") : t("errors.generic"));
        } finally {
          setIsAttachingPhoto(false);
        }
      }}
    />
  ) : null;

  const recordView = currentRecord && adjustOpen ? (
    <AdjustView
      record={currentRecord}
      title={t("adjust.title")}
      intro={t("adjust.intro")}
      placeholder={t("adjust.placeholder")}
      submitLabel={t("adjust.submit")}
      submittingLabel={t("adjust.submitting")}
      backLabel={t("adjust.back")}
      baseLabel={t("adjust.baseLabel")}
      artworkLabel={t("result.artwork")}
      suggestions={list("suggestions").slice(1)}
      isSubmitting={isAdjusting}
      error={adjustError}
      onBack={navigateBack}
      onSubmit={submitAdjustment}
    />
  ) : recordRoute && activeTab !== "studio" && recordViewOpen ? resultSlot : null;

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
        {recordView ?? (
          <>
            {activeTab === "studio" ? (
            <Studio
              config={config}
              locale={locale}
              t={t}
              list={list}
              onStartGeneration={startGenerationJob}
              activeJobs={activeJobs}
              resultSlot={recordViewOpen ? resultSlot : null}
              studioResetRequest={studioResetRequest}
              hasResult={recordViewOpen && Boolean(currentRecord)}
            />
            ) : null}
            {activeTab === "library" ? (
              <Library
                records={library}
                locale={locale}
                emptyLabel={t("empty.library")}
                emptyHint={t("empty.libraryHint")}
                emptyActionLabel={t("empty.libraryAction")}
                actionError={libraryActionError}
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
                onEmptyAction={() => {
                  setLibraryActionError("");
                  goToTab("studio");
                }}
                onOpen={openRecordFromLibrary}
                onFavoriteToggle={async (record, favorite) => {
                  setLibraryActionError("");
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
                ctaLabel={
                  currentRecord && currentRecord.status !== "failed"
                    ? productionEnabled ? t("experts.ctaWithRecord") : t("experts.productionUnavailable")
                    : t("experts.ctaStart")
                }
                ctaDisabled={Boolean(currentRecord && currentRecord.status !== "failed" && !productionEnabled)}
                currentRecord={currentRecord}
                onCta={() => {
                  if (currentRecord && currentRecord.status !== "failed" && productionEnabled) {
                    setAdjustOpen(false);
                    setRecordViewOpen(true);
                    setShowProduction(true);
                    navigate(pathForRecord(currentRecord.id, "experts", "production"));
                  } else {
                    goToTab("studio");
                  }
                }}
              />
            ) : null}
          </>
        )}
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
              onClick={() => goToTab(tab)}
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
          copyHintLabel={t("production.copyHint")}
          copiedOrderLabel={t("production.copiedOrder")}
          copiedWechatLabel={t("production.copiedWechat")}
          successTitleLabel={t("production.successTitle")}
          successIntroLabel={t("production.successIntro")}
          summaryServiceLabel={t("production.summaryService")}
          summarySizeLabel={t("production.summarySize")}
          summaryReferenceLabel={t("production.summaryReference")}
          confirmLabel={t("production.confirm")}
          contactPendingLabel={t("experts.contactPending")}
          productionAvailable={productionEnabled}
          productionUnavailableLabel={t("experts.productionUnavailable")}
          onClose={closeProduction}
        />
      ) : null}
    </div>
  );
}
