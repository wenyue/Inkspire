import { BookOpen, Brush, Languages, Users } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import {
  fallbackConfig,
  createFusion,
  createGeneration,
  regenerateRecord,
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
  type GenerationOperation,
  type GenerationRecord,
  type GenerationStartResult,
  type LibraryRecord,
  type OriginTab,
  type PublicConfig
} from "./api";
import Experts from "./components/Experts";
import GeneratingView from "./components/GeneratingView";
import Library from "./components/Library";
import ParticleBackdrop from "./components/ParticleBackdrop";
import ProductionDialog from "./components/ProductionDialog";
import ConfirmDialog from "./components/ConfirmDialog";
import ResultView from "./components/ResultView";
import { generationFailureKind } from "./generationFailure";
import AdjustView from "./components/AdjustView";
import Studio from "./components/Studio";
import type { Locale } from "./domain";
import {
  readGenerationSessions,
  writeGenerationSessions,
  type GenerationSession,
  type GenerationSessionMap
} from "./generationSession";
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
import {
  readTabScrollPositions,
  writeTabScrollPositions,
  type TabScrollPositions
} from "./tabScrollPosition";

type RecordRouteMode = "result" | "adjust" | "production";
type GenerationPayload = Parameters<typeof createGeneration>[0];

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
const IMAGE_VIEWER_POP_EVENT = "inkspire:image-viewer-pop";

const tabIcons = {
  studio: Brush,
  library: BookOpen,
  experts: Users
};

const originTabs: OriginTab[] = ["studio", "library", "experts"];
const storedSessionLookupOrder: OriginTab[] = ["library", "experts", "studio"];

function generationTime(record: LibraryRecord): number {
  const time = record.created_at ? new Date(record.created_at).getTime() : NaN;
  return Number.isNaN(time) ? -Infinity : time;
}

function visibleLibraryRecords(records: LibraryRecord[]): LibraryRecord[] {
  return records
    .filter((record) => record.favorite !== false && record.status !== "queued" && record.status !== "running")
    .sort((a, b) => generationTime(b) - generationTime(a));
}

function isKnownJobStatus(status: unknown): status is GenerationJob["status"] {
  return status === "queued" || status === "running" || status === "succeeded" || status === "failed";
}

function hasUsableJobPayload(job: GenerationJob): boolean {
  return typeof job.id === "string" && job.id.length > 0
    && typeof job.recordId === "string" && job.recordId.length > 0
    && isKnownJobStatus(job.status);
}

function hasUsableRecordPayload(record: GenerationRecord): boolean {
  return typeof record.id === "string" && record.id.length > 0
    && (record.status === undefined || typeof record.status === "string");
}

function tabToOriginTab(tab: Tab): OriginTab {
  return tab;
}

function isOriginTab(value: unknown): value is OriginTab {
  return value === "studio" || value === "library" || value === "experts";
}

function isGenerationOperation(value: unknown): value is GenerationOperation {
  return value === "create" || value === "adjust";
}

function jobOriginTab(job: GenerationJob): OriginTab {
  return isOriginTab(job.origin_tab) ? job.origin_tab : "studio";
}

function jobOperation(job: GenerationJob): GenerationOperation {
  return isGenerationOperation(job.operation) ? job.operation : "create";
}

function jobStartedAt(job: GenerationJob): number {
  const createdAt = job.created_at ? new Date(job.created_at).getTime() : NaN;
  return Number.isNaN(createdAt) ? Date.now() : createdAt;
}

function pendingJobId(prefix: string, originTab: OriginTab): string {
  return `${prefix}-${originTab}-${Date.now().toString(36)}`;
}

function generationPayloadForSession(payload: GenerationPayload): GenerationSession["payload"] {
  return {
    type: payload.type,
    answers: payload.answers,
    conversationNotes: payload.conversationNotes,
    source_photo_path: payload.source_photo_path,
    recommended_artwork_size: payload.recommended_artwork_size,
    generation_complexity: payload.generation_complexity
  };
}

function storedSessionForJob(sessions: GenerationSessionMap, jobId: string): GenerationSession | undefined {
  for (const tab of storedSessionLookupOrder) {
    const session = sessions[tab];
    if (session?.status === "running" && session.jobId === jobId) {
      return session;
    }
  }
  return undefined;
}

function generationJobMetadata(
  job: GenerationJob,
  sessions: GenerationSessionMap
): { originTab: OriginTab; operation: GenerationOperation } {
  const storedSession = storedSessionForJob(sessions, job.id);
  return {
    originTab: isOriginTab(job.origin_tab) ? job.origin_tab : storedSession?.originTab ?? "studio",
    operation: isGenerationOperation(job.operation) ? job.operation : storedSession?.operation ?? "create"
  };
}

function expectsPreviewGeneration(session: GenerationSession | undefined): boolean {
  return Boolean(
    session
    && session.operation === "create"
    && session.payload.source_photo_path
  );
}

function jobWithResolvedMetadata(job: GenerationJob, sessions: GenerationSessionMap): GenerationJob {
  const metadata = generationJobMetadata(job, sessions);
  return {
    ...job,
    origin_tab: metadata.originTab,
    operation: metadata.operation
  };
}

function jobsWithResolvedMetadata(jobs: GenerationJob[], sessions: GenerationSessionMap): GenerationJob[] {
  return jobs.map((job) => jobWithResolvedMetadata(job, sessions));
}

function jobWithFallbackMetadata(
  job: GenerationJob,
  metadata: { originTab: OriginTab; operation: GenerationOperation }
): GenerationJob {
  return {
    ...job,
    origin_tab: isOriginTab(job.origin_tab) ? job.origin_tab : metadata.originTab,
    operation: isGenerationOperation(job.operation) ? job.operation : metadata.operation
  };
}

function startResultWithFallbackMetadata(
  result: GenerationStartResult,
  metadata: { originTab: OriginTab; operation: GenerationOperation }
): GenerationStartResult {
  return result.job ? { ...result, job: jobWithFallbackMetadata(result.job, metadata) } : result;
}

function runningSessionFromJob(
  job: GenerationJob,
  payload: GenerationSession["payload"] = {},
  metadata?: { originTab: OriginTab; operation: GenerationOperation }
): GenerationSession {
  return {
    originTab: metadata?.originTab ?? jobOriginTab(job),
    operation: metadata?.operation ?? jobOperation(job),
    jobId: job.id,
    resultRecordId: job.recordId,
    startedAt: jobStartedAt(job),
    status: "running",
    payload
  };
}

function isRetryableGenerationSession(session: GenerationSession): boolean {
  return Boolean(session.payload.type && session.payload.answers);
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
  const [generationSessions, setGenerationSessions] = useState<GenerationSessionMap>(() => readGenerationSessions());
  const [generationRetryErrors, setGenerationRetryErrors] = useState<Partial<Record<OriginTab, string>>>({});
  const [restoringRecordId, setRestoringRecordId] = useState("");
  const [showProduction, setShowProduction] = useState(false);
  const [isAttachingPhoto, setIsAttachingPhoto] = useState(false);
  const [resultActionError, setResultActionError] = useState("");
  const [libraryActionError, setLibraryActionError] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState("");
  const [studioResetRequest, setStudioResetRequest] = useState(0);
  const [pendingBackExit, setPendingBackExit] = useState(false);
  const [tabHistory, setTabHistory] = useState(() => readTabHistoryState(
    typeof window === "undefined" ? "/studio" : `${window.location.pathname}${window.location.search}`
  ));
  const [initialTabScrollPositions] = useState(readTabScrollPositions);
  const activeJobsRef = useRef<GenerationJob[]>([]);
  const generationSessionsRef = useRef<GenerationSessionMap>(generationSessions);
  const autoFusionRecordIds = useRef<Set<string>>(new Set());
  const recordCacheRef = useRef<Map<string, GenerationRecord>>(new Map());
  const adjustSubmitRef = useRef(false);
  const tabHistoryRef = useRef(tabHistory);
  const skipInitialPopSyncRef = useRef(true);
  const lastHandledPopKeyRef = useRef<string | null>(null);
  const preserveRecordRouteStateRef = useRef(false);
  const studioResultGuardRef = useRef(false);
  const studioResultPathRef = useRef("/studio");
  const imageViewerHandledPopRef = useRef(false);
  const mainSurfaceRef = useRef<HTMLElement | null>(null);
  const tabScrollPositionsRef = useRef<TabScrollPositions>(initialTabScrollPositions);
  const pendingScrollRestoreRef = useRef<{ tab: Tab; top: number } | null>(null);
  const programmaticScrollRef = useRef<{ tab: Tab; top: number } | null>(null);
  const pageHiddenRef = useRef(false);
  const userScrollActiveRef = useRef(false);

  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  const saveTabScrollPosition = useCallback((tab: Tab, top: number) => {
    const next = { ...tabScrollPositionsRef.current, [tab]: Math.max(0, top) };
    tabScrollPositionsRef.current = next;
    writeTabScrollPositions(next);
  }, []);

  const restoreTabScrollPosition = useCallback((tab: Tab) => {
    const surface = mainSurfaceRef.current;
    if (!surface) {
      return;
    }
    const top = tabScrollPositionsRef.current[tab];
    userScrollActiveRef.current = false;
    pendingScrollRestoreRef.current = { tab, top };
    surface.scrollTop = top;
    programmaticScrollRef.current = { tab, top: surface.scrollTop };
    if (Math.abs(surface.scrollTop - top) < 1) {
      pendingScrollRestoreRef.current = null;
    }
  }, []);

  const onMainSurfaceScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    if (pageHiddenRef.current) {
      return;
    }
    if (pendingScrollRestoreRef.current?.tab === activeTab) {
      return;
    }
    if (!userScrollActiveRef.current) {
      return;
    }
    const top = event.currentTarget.scrollTop;
    const programmatic = programmaticScrollRef.current;
    if (programmatic?.tab === activeTab && Math.abs(programmatic.top - top) < 1) {
      programmaticScrollRef.current = null;
      return;
    }
    programmaticScrollRef.current = null;
    pendingScrollRestoreRef.current = null;
    saveTabScrollPosition(activeTab, top);
    userScrollActiveRef.current = false;
  }, [activeTab, saveTabScrollPosition]);

  const beginUserScroll = useCallback(() => {
    userScrollActiveRef.current = true;
    if (pendingScrollRestoreRef.current?.tab === activeTab) {
      pendingScrollRestoreRef.current = null;
      programmaticScrollRef.current = null;
    }
  }, [activeTab]);

  useLayoutEffect(() => {
    restoreTabScrollPosition(activeTab);
  }, [activeTab, restoreTabScrollPosition]);

  useEffect(() => {
    const onPageHide = () => {
      pageHiddenRef.current = true;
      userScrollActiveRef.current = false;
    };
    const onPageShow = () => {
      pageHiddenRef.current = false;
      userScrollActiveRef.current = false;
    };
    window.addEventListener("beforeunload", onPageHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("beforeunload", onPageHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const activeTabContentVersion = activeTab === "library"
    ? library.length
    : activeTab === "experts" ? config.experts.length : 0;

  useLayoutEffect(() => {
    if (pendingScrollRestoreRef.current?.tab === activeTab) {
      restoreTabScrollPosition(activeTab);
    }
  }, [activeTab, activeTabContentVersion, restoreTabScrollPosition]);

  useEffect(() => {
    const content = mainSurfaceRef.current?.firstElementChild;
    if (!content || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (pendingScrollRestoreRef.current?.tab === activeTab) {
        restoreTabScrollPosition(activeTab);
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [activeTab, activeTabContentVersion, restoreTabScrollPosition]);

  const updateGenerationSessions = useCallback((updater: (sessions: GenerationSessionMap) => GenerationSessionMap) => {
    setGenerationSessions((current) => {
      const next = updater(current);
      generationSessionsRef.current = next;
      return next;
    });
  }, []);

  const upsertGenerationSession = useCallback((session: GenerationSession) => {
    updateGenerationSessions((sessions) => ({
      ...sessions,
      [session.originTab]: session
    }));
  }, [updateGenerationSessions]);

  const clearGenerationSession = useCallback((originTab: OriginTab) => {
    updateGenerationSessions((sessions) => {
      if (!sessions[originTab]) {
        return sessions;
      }
      const next = { ...sessions };
      delete next[originTab];
      return next;
    });
  }, [updateGenerationSessions]);

  const clearGenerationSessionIfJob = useCallback((originTab: OriginTab, jobId: string) => {
    updateGenerationSessions((sessions) => {
      if (sessions[originTab]?.jobId !== jobId) {
        return sessions;
      }
      const next = { ...sessions };
      delete next[originTab];
      return next;
    });
  }, [updateGenerationSessions]);

  const markGenerationSessionFailed = useCallback((job: GenerationJob, error?: string, record?: GenerationRecord) => {
    updateGenerationSessions((sessions) => {
      const metadata = generationJobMetadata(job, sessions);
      const current = sessions[metadata.originTab];
      return {
        ...sessions,
        [metadata.originTab]: {
          ...(current ?? runningSessionFromJob(job, {}, metadata)),
          originTab: metadata.originTab,
          operation: current?.operation ?? metadata.operation,
          jobId: current?.jobId ?? job.id,
          resultRecordId: current?.resultRecordId ?? job.recordId,
          status: "failed",
          error: error || job.error,
          failureKind: generationFailureKind(record) ?? generationFailureKind(job)
        }
      };
    });
  }, [updateGenerationSessions]);

  useEffect(() => {
    loadPublicConfig().then((nextConfig) => {
      setConfig(nextConfig);
      setLocale((currentLocale) => {
        const stored = typeof window !== "undefined" ? window.localStorage.getItem(LOCALE_KEY) : null;
        return isLocale(stored) ? currentLocale : nextConfig.defaultLocale ?? "zh-Hans";
      });
    });
    loadLibrary().then((records) => setLibrary(visibleLibraryRecords(records)));
  }, []);

  useEffect(() => {
    activeJobsRef.current = activeJobs;
  }, [activeJobs]);

  useEffect(() => {
    generationSessionsRef.current = generationSessions;
    writeGenerationSessions(generationSessions);
  }, [generationSessions]);

  useEffect(() => {
    const onImageViewerPop = () => {
      imageViewerHandledPopRef.current = true;
    };
    window.addEventListener(IMAGE_VIEWER_POP_EVENT, onImageViewerPop);
    return () => window.removeEventListener(IMAGE_VIEWER_POP_EVENT, onImageViewerPop);
  }, []);

  useEffect(() => {
    tabHistoryRef.current = tabHistory;
    writeTabHistoryState(tabHistory);
  }, [tabHistory]);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  const onStudioResult = Boolean(
    recordRoute &&
      recordRoute.mode === "result" &&
      recordViewOpen &&
      currentRecord &&
      readSourceTab(location.search) === "studio"
  );

  useEffect(() => {
    if (!isKnownTopLevelPath(location.pathname) && !recordRoute) {
      return;
    }
    if (navigationType === "POP") {
      if (lastHandledPopKeyRef.current === location.key) {
        if (onStudioResult) {
          studioResultGuardRef.current = true;
          studioResultPathRef.current = pathWithSearch;
        }
        return;
      }
      lastHandledPopKeyRef.current = location.key;
      if (skipInitialPopSyncRef.current) {
        skipInitialPopSyncRef.current = false;
        studioResultGuardRef.current = onStudioResult;
        if (onStudioResult) {
          studioResultPathRef.current = pathWithSearch;
        }
        return;
      }
      if (imageViewerHandledPopRef.current) {
        imageViewerHandledPopRef.current = false;
        studioResultGuardRef.current = onStudioResult;
        if (onStudioResult) {
          studioResultPathRef.current = pathWithSearch;
        }
        return;
      }
      if (studioResultGuardRef.current) {
        preserveRecordRouteStateRef.current = true;
        navigate(studioResultPathRef.current, { replace: true });
        setPendingBackExit(true);
        return;
      }
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
      if (next.path !== pathWithSearch) {
        navigate(next.path, { replace: true });
      }
      studioResultGuardRef.current = false;
      return;
    }
    lastHandledPopKeyRef.current = null;
    skipInitialPopSyncRef.current = false;
    setTabHistory((current) => (
      navigationType === "REPLACE"
        ? replaceTabRoute(current, pathWithSearch)
        : pushTabRoute(current, pathWithSearch)
    ));
    studioResultGuardRef.current = onStudioResult;
    if (onStudioResult) {
      studioResultPathRef.current = pathWithSearch;
    } else {
      setPendingBackExit(false);
    }
  }, [currentRecord?.id, location.key, location.pathname, navigate, navigationType, onStudioResult, pathWithSearch, recordRoute?.mode, recordRoute?.recordId]);

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
    if (!recordRoute) {
      if (preserveRecordRouteStateRef.current) {
        preserveRecordRouteStateRef.current = false;
        return;
      }
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
  const productionDialogOpen = showProduction && recordRoute?.mode === "production";

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
      const resolvedJob = jobWithResolvedMetadata(job, generationSessionsRef.current);
      const next = [resolvedJob, ...jobs.filter((item) => item.id !== resolvedJob.id)]
        .filter((item) => item.status === "queued" || item.status === "running")
        .slice(0, 2);
      activeJobsRef.current = next;
      return next;
    });
  }, []);

  const replaceActiveJobs = useCallback((jobs: GenerationJob[]) => {
    const next = jobsWithResolvedMetadata(jobs, generationSessionsRef.current)
      .filter((job) => job.status === "queued" || job.status === "running")
      .slice(0, 2);
    activeJobsRef.current = next;
    setActiveJobs(next);
  }, []);

  const seedGenerationSessionsFromJobs = useCallback((jobs: GenerationJob[]) => {
    updateGenerationSessions((sessions) => {
      const activeJobIds = new Set(
        jobs
          .filter((job) => hasUsableJobPayload(job) && (job.status === "queued" || job.status === "running"))
          .map((job) => job.id)
      );
      let next = sessions;
      for (const [tab, session] of Object.entries(sessions) as Array<[OriginTab, GenerationSession]>) {
        if (!session) {
          continue;
        }
        if (session.status === "running" && !activeJobIds.has(session.jobId)) {
          next = { ...next };
          delete next[tab];
        }
      }
      for (const job of jobs) {
        if (!hasUsableJobPayload(job) || (job.status !== "queued" && job.status !== "running")) {
          continue;
        }
        const metadata = generationJobMetadata(job, next);
        for (const tab of originTabs) {
          const duplicate = next[tab];
          if (tab !== metadata.originTab && duplicate?.status === "running" && duplicate.jobId === job.id) {
            next = { ...next };
            delete next[tab];
          }
        }
        const current = next[metadata.originTab];
        const session = runningSessionFromJob(job, current?.payload, metadata);
        next = {
          ...next,
          [metadata.originTab]: {
            ...current,
            ...session,
            payload: current?.payload ?? session.payload
          }
        };
      }
      return next;
    });
  }, [updateGenerationSessions]);

  useEffect(() => {
    loadActiveJobs()
      .then((jobs) => {
        const resolvedJobs = jobsWithResolvedMetadata(jobs, generationSessionsRef.current);
        setActiveJobs(resolvedJobs);
        activeJobsRef.current = resolvedJobs;
        seedGenerationSessionsFromJobs(resolvedJobs);
      })
      .catch(() => {});
  }, [seedGenerationSessionsFromJobs]);

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

  const applyFinishedRecordForOrigin = useCallback((record: GenerationRecord, originTab: OriginTab) => {
    onResult(record);
    clearGenerationSession(originTab);
    const shouldOpenResult = activeTab === originTab;
    setRecordViewOpen(shouldOpenResult);
    if (!shouldOpenResult) {
      return;
    }
    setAdjustOpen(false);
    setShowProduction(false);
    navigate(pathForRecord(record.id, originTab), { replace: true });
  }, [activeTab, clearGenerationSession, navigate, onResult]);

  const startFusionJob = useCallback(async (
    recordId: string,
    sourcePhotoPath = "",
    originTab: OriginTab = "studio",
    operation: GenerationOperation = "create"
  ) => {
    const existingSession = generationSessionsRef.current[originTab];
    const pendingId = pendingJobId("pending-fusion", originTab);
    const startedAt = existingSession?.status === "running" ? existingSession.startedAt : Date.now();
    const payload = {
      ...(existingSession?.payload ?? {}),
      source_photo_path: sourcePhotoPath || existingSession?.payload.source_photo_path
    };
    upsertGenerationSession({
      originTab,
      operation,
      jobId: pendingId,
      sourceRecordId: recordId,
      resultRecordId: recordId,
      startedAt,
      status: "running",
      payload
    });

    try {
      const result = startResultWithFallbackMetadata(
        await createFusion(recordId, sourcePhotoPath, originTab, operation),
        { originTab, operation }
      );
      handleGenerationStart(result);
      if (result.job?.status === "queued" || result.job?.status === "running") {
        upsertGenerationSession({
          ...runningSessionFromJob(result.job, { source_photo_path: sourcePhotoPath }, { originTab, operation }),
          startedAt,
          sourceRecordId: recordId
        });
        navigate(fallbackPathForSource(originTab), { replace: true });
      }
      if (result.record && (!result.job || result.job.status === "succeeded" || result.job.status === "failed")) {
        clearGenerationSession(originTab);
        applyFinishedRecordForOrigin(result.record, originTab);
      }
      if (result.job?.status === "failed") {
        throw new Error(result.job.error || "fusion generation failed");
      }
    } catch (error) {
      if (isGenerationLimitError(error)) {
        replaceActiveJobs((error.payload as GenerationStartResult).activeJobs ?? []);
      }
      clearGenerationSessionIfJob(originTab, pendingId);
      throw error;
    }
  }, [applyFinishedRecordForOrigin, clearGenerationSession, clearGenerationSessionIfJob, handleGenerationStart, navigate, replaceActiveJobs, upsertGenerationSession]);

  const startGenerationJob = useCallback(async (payload: GenerationPayload) => {
    const originTab = payload.origin_tab ?? "studio";
    const operation = payload.operation ?? "create";
    const pendingId = pendingJobId("pending-generation", originTab);
    const startedAt = Date.now();
    upsertGenerationSession({
      originTab,
      operation,
      jobId: pendingId,
      startedAt,
      status: "running",
      payload: generationPayloadForSession(payload)
    });

    try {
      const result = startResultWithFallbackMetadata(
        await createGeneration(payload),
        { originTab, operation }
      );
      handleGenerationStart(result);
      if (result.job?.status === "queued" || result.job?.status === "running") {
        upsertGenerationSession({
          ...runningSessionFromJob(result.job, generationPayloadForSession(payload), { originTab, operation }),
          startedAt
        });
        navigate(fallbackPathForSource(originTab), { replace: true });
      }
      if (result.record && !result.job) {
        if (
          result.record.status === "succeeded"
          && payload.source_photo_path
          && result.record.source_photo_path
          && !result.record.fusion_path
          && !autoFusionRecordIds.current.has(result.record.id)
        ) {
          autoFusionRecordIds.current.add(result.record.id);
          await startFusionJob(result.record.id, result.record.source_photo_path, originTab, payload.operation ?? "create");
          return;
        }
        clearGenerationSession(originTab);
        applyFinishedRecord(result.record);
      }
    } catch (error) {
      if (isGenerationLimitError(error)) {
        replaceActiveJobs((error.payload as GenerationStartResult).activeJobs ?? []);
      }
      clearGenerationSessionIfJob(originTab, pendingId);
      throw error;
    }
  }, [applyFinishedRecord, clearGenerationSession, clearGenerationSessionIfJob, handleGenerationStart, navigate, replaceActiveJobs, startFusionJob, upsertGenerationSession]);

  const startRecordRegeneration = useCallback(async (
    recordId: string,
    originTab: OriginTab,
    operation: GenerationOperation,
    payload: GenerationSession["payload"]
  ) => {
    const pendingId = pendingJobId("pending-regeneration", originTab);
    const startedAt = Date.now();
    upsertGenerationSession({
      originTab,
      operation,
      jobId: pendingId,
      sourceRecordId: recordId,
      startedAt,
      status: "running",
      payload
    });

    try {
      const result = startResultWithFallbackMetadata(
        await regenerateRecord(recordId, { origin_tab: originTab, operation }),
        { originTab, operation }
      );
      handleGenerationStart(result);
      if (result.job?.status === "queued" || result.job?.status === "running") {
        upsertGenerationSession({
          ...runningSessionFromJob(result.job, payload, { originTab, operation }),
          startedAt,
          sourceRecordId: recordId
        });
        navigate(fallbackPathForSource(originTab), { replace: true });
      }
      if (result.record && !result.job) {
        if (
          result.record.status === "succeeded"
          && result.record.source_photo_path
          && !result.record.fusion_path
          && !autoFusionRecordIds.current.has(result.record.id)
        ) {
          autoFusionRecordIds.current.add(result.record.id);
          await startFusionJob(result.record.id, result.record.source_photo_path, originTab, operation);
          return;
        }
        clearGenerationSession(originTab);
        applyFinishedRecord(result.record);
      }
      if (result.job?.status === "failed") {
        throw new Error(result.job.error || "regeneration failed");
      }
    } catch (error) {
      if (isGenerationLimitError(error)) {
        replaceActiveJobs((error.payload as GenerationStartResult).activeJobs ?? []);
      }
      clearGenerationSessionIfJob(originTab, pendingId);
      throw error;
    }
  }, [applyFinishedRecord, clearGenerationSession, clearGenerationSessionIfJob, handleGenerationStart, navigate, replaceActiveJobs, startFusionJob, upsertGenerationSession]);

  const finishRecordForJob = useCallback(async (job: GenerationJob, record: GenerationRecord) => {
    const metadata = generationJobMetadata(job, generationSessionsRef.current);
    const originTab = metadata.originTab;
    if (
      job.stage === "artwork"
      && record.status === "succeeded"
      && record.source_photo_path
      && !record.fusion_path
      && !autoFusionRecordIds.current.has(record.id)
    ) {
      autoFusionRecordIds.current.add(record.id);
      await startFusionJob(record.id, record.source_photo_path, originTab, metadata.operation);
      return;
    }
    if (record.status === "failed") {
      markGenerationSessionFailed(job, record.title, record);
      return;
    }
    applyFinishedRecordForOrigin(record, originTab);
  }, [applyFinishedRecordForOrigin, markGenerationSessionFailed, startFusionJob]);

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
        const polledJob = await getJob(job.id);
        if (!hasUsableJobPayload(polledJob)) {
          return;
        }
        const nextJob = jobWithResolvedMetadata(
          jobWithFallbackMetadata(polledJob, { originTab: jobOriginTab(job), operation: jobOperation(job) }),
          generationSessionsRef.current
        );
        if (nextJob.status === "queued" || nextJob.status === "running") {
          updates.set(nextJob.id, nextJob);
          return;
        }
        completedIds.add(nextJob.id);
        if (nextJob.status === "failed") {
          markGenerationSessionFailed(nextJob);
          return;
        }
        await completeJob(nextJob);
      } catch {
        try {
          const record = await getRecord(job.recordId);
          if (!hasUsableRecordPayload(record)) {
            return;
          }
          if (record.status === "queued" || record.status === "running") {
            return;
          }
          completedIds.add(job.id);
          if (record.status === "failed") {
            markGenerationSessionFailed(job, record.title, record);
            return;
          }
          await finishRecordForJob(job, record);
        } catch {
          completedIds.add(job.id);
          markGenerationSessionFailed(job);
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
  }, [completeJob, finishRecordForJob, markGenerationSessionFailed]);

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
    setGenerationRetryErrors({});
    if (tab === "studio" && activeTab === "studio" && currentRecord && !adjustOpen && !productionDialogOpen) {
      startNewArtwork();
      return;
    }
    if (tab === activeTab && !productionDialogOpen && !adjustOpen) {
      return;
    }
    const surface = mainSurfaceRef.current;
    if (surface) {
      saveTabScrollPosition(activeTab, surface.scrollTop);
    }
    setShowProduction(false);
    setAdjustOpen(false);
    const currentTabHistory = pushTabRoute(tabHistoryRef.current, pathWithSearch);
    const target = switchTabRoute(currentTabHistory, tab);
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

  const cancelBackExit = () => setPendingBackExit(false);

  const confirmBackExit = () => {
    setPendingBackExit(false);
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
    navigate("/studio", { replace: true });
  };

  const submitAdjustment = async (note: string) => {
    if (!currentRecord) {
      return;
    }
    const originTab = tabToOriginTab(readSourceTab(location.search));
    setIsAdjusting(true);
    setAdjustError("");
    adjustSubmitRef.current = true;
    try {
      await startGenerationJob({
        type: currentRecord.type,
        answers: currentRecord.answers ?? {},
        conversationNotes: note,
        source_photo_path: currentRecord.source_photo_path,
        recommended_artwork_size: currentRecord.recommended_artwork_size ?? null,
        generation_complexity: currentRecord.generation_complexity,
        origin_tab: originTab,
        operation: "adjust"
      });
    } catch (error) {
      adjustSubmitRef.current = false;
      setAdjustError(isGenerationLimitError(error) ? t("studio.generationLimit") : t("errors.generic"));
    } finally {
      setIsAdjusting(false);
    }
  };

  const retryGenerationSession = useCallback((session: GenerationSession) => {
    if (!session.payload.type || !session.payload.answers) {
      return;
    }
    setGenerationRetryErrors((current) => ({ ...current, [session.originTab]: "" }));
    const retry = session.sourceRecordId
      ? startRecordRegeneration(session.sourceRecordId, session.originTab, session.operation, session.payload)
      : startGenerationJob({
        type: session.payload.type,
        answers: session.payload.answers,
        conversationNotes: session.payload.conversationNotes ?? "",
        source_photo_path: session.payload.source_photo_path,
        recommended_artwork_size: session.payload.recommended_artwork_size ?? null,
        generation_complexity: session.payload.generation_complexity,
        origin_tab: session.originTab,
        operation: session.operation
      });
    void retry.catch((error) => {
      upsertGenerationSession(session);
      setGenerationRetryErrors((current) => ({
        ...current,
        [session.originTab]: isGenerationLimitError(error)
          ? t("studio.generationLimit")
          : t("generationFailure.retryError")
      }));
    });
  }, [startGenerationJob, startRecordRegeneration, t, upsertGenerationSession]);

  const retryCalligraphyRecord = useCallback(async () => {
    if (!currentRecord) {
      return;
    }
    const originTab = tabToOriginTab(readSourceTab(location.search));
    setResultActionError("");
    try {
      await startRecordRegeneration(currentRecord.id, originTab, "adjust", {
        type: currentRecord.type,
        answers: currentRecord.answers,
        source_photo_path: currentRecord.source_photo_path,
        recommended_artwork_size: currentRecord.recommended_artwork_size ?? null,
        generation_complexity: currentRecord.generation_complexity
      });
    } catch (error) {
      setResultActionError(isGenerationLimitError(error)
        ? t("studio.generationLimit")
        : t("generationFailure.retryError"));
    }
  }, [currentRecord, location.search, startRecordRegeneration, t]);

  const recoverClassicReference = useCallback((originTab?: OriginTab) => {
    if (originTab) {
      clearGenerationSession(originTab);
    }
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
    navigate("/studio?step=classic");
  }, [clearGenerationSession, currentRecord?.id, navigate]);

  const resultSource = readSourceTab(location.search);
  let resultBackLabel: string | undefined;
  let resultOnBack: (() => void) | undefined;
  if (resultSource === "studio") {
    resultBackLabel = t("result.backStudio");
    resultOnBack = () => setPendingBackExit(true);
  } else if (resultSource === "library") {
    resultBackLabel = t("result.back");
    resultOnBack = () => navigate(fallbackPathForSource(resultSource));
  }
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
      generateFusionLabel={t("result.generateFusion")}
      reuploadEnvironmentPhotoLabel={t("result.reuploadEnvironmentPhoto")}
      busyLabel={t("studio.generating")}
      failedTitle={t("result.failedTitle")}
      failedHint={t("result.failedHint")}
      imageUnavailableTitle={t("result.imageUnavailableTitle")}
      imageUnavailableHint={t("result.imageUnavailableHint")}
      fusionUnavailableTitle={t("result.fusionUnavailableTitle")}
      fusionUnavailableHint={t("result.fusionUnavailableHint")}
      backLabel={resultBackLabel}
      actionError={resultActionError}
      isAttachingPhoto={isAttachingPhoto}
      canMake={productionEnabled}
      onBack={resultOnBack}
      onMake={openProduction}
      onAdjust={openAdjust}
      onGenerateFusion={async () => {
        if (!currentRecord?.id || !currentRecord.source_photo_path) {
          return;
        }
        setIsAttachingPhoto(true);
        setResultActionError("");
        try {
          await startFusionJob(currentRecord.id, currentRecord.source_photo_path, tabToOriginTab(resultSource), "adjust");
        } catch {
          setResultActionError(t("errors.generic"));
        } finally {
          setIsAttachingPhoto(false);
        }
      }}
      t={t}
      onSelectClassic={() => recoverClassicReference()}
      onRetryCalligraphy={retryCalligraphyRecord}
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
          await startFusionJob(currentRecord.id, upload.source_photo_path, tabToOriginTab(resultSource), "adjust");
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
      clearLabel={t("adjust.clearNote")}
      baseLabel={t("adjust.baseLabel")}
      artworkLabel={t("result.artwork")}
      t={t}
      suggestions={list(currentRecord.type === "calligraphy"
        ? "suggestions.calligraphy"
        : "suggestions.painting").slice(1)}
      isSubmitting={isAdjusting}
      error={adjustError}
      onBack={navigateBack}
      onSubmit={submitAdjustment}
    />
  ) : recordRoute && activeTab !== "studio" && recordViewOpen ? resultSlot : null;
  const activeTabSession = generationSessions[tabToOriginTab(activeTab)];
  const activeTabSessionRetry = activeTabSession && isRetryableGenerationSession(activeTabSession)
    ? () => retryGenerationSession(activeTabSession)
    : undefined;

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

      <main
        ref={mainSurfaceRef}
        className="main-surface"
        onKeyDown={beginUserScroll}
        onPointerDown={beginUserScroll}
        onPointerMove={beginUserScroll}
        onScroll={onMainSurfaceScroll}
        onTouchMove={beginUserScroll}
        onTouchStart={beginUserScroll}
        onWheel={beginUserScroll}
      >
        {activeTabSession ? (
          <GeneratingView
            originTab={activeTabSession.originTab}
            operation={activeTabSession.operation}
            jobId={activeTabSession.jobId}
            startedAt={activeTabSession.startedAt}
            status={activeTabSession.status}
            error={activeTabSession.error}
            locale={locale}
            t={t}
            onRetry={activeTabSessionRetry}
            failureKind={activeTabSession.failureKind}
            onSelectClassic={() => recoverClassicReference(activeTabSession.originTab)}
            recoveryError={generationRetryErrors[activeTabSession.originTab]}
            expectsPreviewGeneration={expectsPreviewGeneration(activeTabSession)}
          />
        ) : recordView ?? (
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
                emptyDetail={t("empty.libraryDetail")}
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
                  removeConfirmAction: t("library.removeConfirmAction"),
                  workTypePainting: t("library.workTypePainting"),
                  workTypeCalligraphy: t("library.workTypeCalligraphy"),
                  format: t("library.format"),
                  density: t("library.density"),
                  densitySmall: t("library.densitySmall"),
                  densityMedium: t("library.densityMedium"),
                  densityLarge: t("library.densityLarge")
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
                credentialsLabel={t("experts.credentialsLabel")}
                sampleHeading={t("experts.sampleHeading")}
                sampleHint={t("experts.sampleHint")}
                profileNotice={t("experts.profileNotice")}
                serviceBoundary={t("experts.serviceBoundary")}
                consultLabel={t("experts.consultLabel")}
                consultHint={t("experts.consultHint")}
                copiedLabel={t("experts.consultCopied")}
                consultWechat={config.productionContact?.wechat}
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

      {productionDialogOpen && currentRecord && currentRecord.status !== "failed" ? (
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
          referenceRecommendedBadgeLabel={t("production.referenceRecommendedBadge")}
          referenceCautionBadgeLabel={t("production.referenceCautionBadge")}
          confirmLabel={t("production.confirm")}
          contactPendingLabel={t("experts.contactPending")}
          productionAvailable={productionEnabled}
          productionUnavailableLabel={t("experts.productionUnavailable")}
          onClose={closeProduction}
        />
      ) : null}
      {pendingBackExit ? (
        <ConfirmDialog
          title={t("result.backConfirmTitle")}
          body={t("result.backConfirmBody")}
          confirmLabel={t("result.backConfirmConfirm")}
          cancelLabel={t("result.backConfirmCancel")}
          onConfirm={confirmBackExit}
          onCancel={cancelBackExit}
        />
      ) : null}
    </div>
  );
}
