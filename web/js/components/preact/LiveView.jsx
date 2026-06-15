/**
 * LightNVR Web Interface LiveView Component
 * Preact component for the HLS live view page
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'preact/hooks';
import { showStatusMessage } from './ToastContainer.jsx';
import { useFullscreenManager, FullscreenManager, useFullscreenGridNav } from './FullscreenManager.jsx';
import { useQuery } from '../../query-client.js';
import { SnapshotManager, useSnapshotManager } from './SnapshotManager.jsx';
import { HLSVideoCell } from './HLSVideoCell.jsx';
import { MSEVideoCell } from './MSEVideoCell.jsx';
import { WebRTCVideoCell } from './WebRTCVideoCell.jsx';
import { FullscreenTimelineOverlay } from './FullscreenTimelineOverlay.jsx';
import { isGo2rtcEnabled } from '../../utils/settings-utils.js';
import { useCameraOrder } from './useCameraOrder.js';
import { GridPicker, computeOptimalGrid, MAX_GRID_CELLS } from './GridPicker.jsx';
import { buildBuildingTree } from '../../utils/building-hierarchy.js';
import { useI18n } from '../../i18n.js';

/**
 * Convert the old single-string layout value to cols/rows for backward compat.
 * Defined as a function declaration so it hoists safely in the bundle.
 */
function legacyLayoutToColsRows(layout) {
  switch (layout) {
    case '1':  return [1, 1];
    case '2':  return [2, 1];
    case '6':  return [3, 2];
    case '9':  return [3, 3];
    case '16': return [4, 4];
    default:   return [2, 2]; // '4' and anything else → 2×2
  }
}

function getLiveInitDelay({ isWebRTC, useMSE, go2rtcAvailable, index, totalStreams }) {
  if (totalStreams <= 1) {
    return 0;
  }

  if (isWebRTC) {
    return index * 350;
  }

  if (useMSE) {
    const immediateCount = Math.min(6, totalStreams);
    if (index < immediateCount) {
      return 0;
    }
    return Math.ceil((index - immediateCount + 1) / 6) * 100;
  }

  if (go2rtcAvailable) {
    const immediateCount = Math.min(12, totalStreams);
    if (index < immediateCount) {
      return 0;
    }
    return Math.ceil((index - immediateCount + 1) / 12) * 75;
  }

  const immediateCount = Math.min(4, totalStreams);
  if (index < immediateCount) {
    return 0;
  }
  return Math.ceil((index - immediateCount + 1) / 4) * 150;
}

function createWorkspaceTile(cameraId) {
  return {
    instanceId: `tile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    cameraId,
  };
}

function LiveEmptyState({ t, title, message, actionHref, actionLabel, actionOnClick, secondaryText }) {
  return (
    <div className="live-empty-state col-span-full row-span-full">
      <div className="live-empty-visual" aria-hidden="true">
        <div className="live-empty-camera-wall">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div className="live-empty-lens">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14" />
            <rect x="3" y="6" width="12" height="12" rx="2.2" strokeWidth="1.8" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 10h3" />
          </svg>
        </div>
      </div>

      <div className="live-empty-content">
        <p className="live-empty-eyebrow">{t('live.liveView')}</p>
        <h3>{title}</h3>
        <p>{message}</p>
      </div>

      {actionOnClick && actionLabel ? (
        <button type="button" className="btn-primary live-empty-action" onClick={actionOnClick}>
          {actionLabel}
        </button>
      ) : actionHref && actionLabel && (
        <a href={actionHref} className="btn-primary live-empty-action">
          {actionLabel}
        </a>
      )}

      {secondaryText && (
        <p className="live-empty-secondary">{secondaryText}</p>
      )}
    </div>
  );
}

/**
 * Shared live camera grid for HLS, MSE, and WebRTC modes.
 * @returns {JSX.Element} LiveView component
 */
export function LiveView({ isWebRTCDisabled, mode = 'hls' }) {
  const { t } = useI18n();
  const isWebRTC = mode === 'webrtc';
  const storagePrefix = isWebRTC ? 'webrtc' : 'hls';
  const logLabel = isWebRTC ? 'WebRTC' : 'HLS';
  // Use the snapshot manager hook
  useSnapshotManager();

  // Use the fullscreen manager hook
  const { isFullscreen, setIsFullscreen, toggleFullscreen } = useFullscreenManager();

  // State for streams and layout
  const [streams, setStreams] = useState([]);
  const [workspaceTiles, setWorkspaceTiles] = useState([]);
  const [workspaceStarted, setWorkspaceStarted] = useState(false);
  const [workspaceAutoGrid, setWorkspaceAutoGrid] = useState(true);
  const [urlStreamHydrated, setUrlStreamHydrated] = useState(false);
  const [removingTileIds, setRemovingTileIds] = useState(new Set());
  const removeTimeoutsRef = useRef(new Map());

  // Tag filter: '' means "All"
  const [tagFilter, setTagFilter] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('tag') || localStorage.getItem(`lightnvr-${storagePrefix}-tag-filter`) || '';
  });

  // State for toggling stream labels and controls visibility
  const [showLabels, setShowLabels] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const u = p.get('labels');
    if (u !== null) return u !== '0';
    const stored = localStorage.getItem('lightnvr-show-labels');
    return stored !== null ? stored === 'true' : true;
  });
  const [showControls, setShowControls] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const u = p.get('controls');
    if (u !== null) return u !== '0';
    const stored = localStorage.getItem('lightnvr-show-controls');
    return stored !== null ? stored === 'true' : true;
  });
  // Global detection overlay toggle (persisted to localStorage)
  const [showDetections, setShowDetections] = useState(() => {
    const stored = localStorage.getItem('lightnvr-show-detections');
    return stored !== null ? stored === 'true' : true;
  });
  const [isLoading, setIsLoading] = useState(true);

  // State for go2rtc availability
  const [go2rtcAvailable, setGo2rtcAvailable] = useState(false);

  // State for go2rtc mode - determines whether to use MSE or HLS
  // Initialize from URL param if present
  const [useMSE, setUseMSE] = useState(() => {
    if (isWebRTC) return false;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('mode') === 'mse';
  });

  // Initialize cols/rows from URL params, shared localStorage key, or legacy per-view keys.
  // All live views (WebRTC / HLS / MSE) share 'lightnvr-live-cols' / 'lightnvr-live-rows'
  // so a layout change on one page carries over to the others.
  // autoGrid stays true when no preference exists — streams-load effect will
  // auto-size the grid to fit the available camera count.
  const [autoGrid, setAutoGrid] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('cols') === null
      && localStorage.getItem('lightnvr-live-cols') === null
      && localStorage.getItem(`lightnvr-${storagePrefix}-cols`) === null
      && localStorage.getItem(`lightnvr-${storagePrefix}-layout`) === null;
  });
  const [cols, setCols] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const cp = urlParams.get('cols');
    if (cp) return Math.max(1, Math.min(9, parseInt(cp, 10) || 2));
    const shared = localStorage.getItem('lightnvr-live-cols');
    if (shared) return Math.max(1, Math.min(9, parseInt(shared, 10) || 2));
    const legacy = localStorage.getItem(`lightnvr-${storagePrefix}-cols`);
    if (legacy) return Math.max(1, Math.min(9, parseInt(legacy, 10) || 2));
    const oldLayout = localStorage.getItem(`lightnvr-${storagePrefix}-layout`);
    if (oldLayout) return legacyLayoutToColsRows(oldLayout)[0];
    return 2; // placeholder until autoGrid resolves
  });
  const [rows, setRows] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const rp = urlParams.get('rows');
    if (rp) return Math.max(1, Math.min(9, parseInt(rp, 10) || 2));
    const shared = localStorage.getItem('lightnvr-live-rows');
    if (shared) return Math.max(1, Math.min(9, parseInt(shared, 10) || 2));
    const legacy = localStorage.getItem(`lightnvr-${storagePrefix}-rows`);
    if (legacy) return Math.max(1, Math.min(9, parseInt(legacy, 10) || 2));
    const oldLayout = localStorage.getItem(`lightnvr-${storagePrefix}-layout`);
    if (oldLayout) return legacyLayoutToColsRows(oldLayout)[1];
    return 2; // placeholder until autoGrid resolves
  });

  // Total streams per page — derived immediately so URL-sync useEffect can reference
  // isSingleStream in its dependency array without TDZ issues.
  const maxStreams = cols * rows;

  // Clamp cols×rows to MAX_GRID_CELLS — guards against stale URL params or
  // localStorage values written before the 36-stream cap was enforced.
  useEffect(() => {
    if (cols * rows > MAX_GRID_CELLS) {
      setRows(Math.max(1, Math.floor(MAX_GRID_CELLS / cols)));
    }
  }, [cols, rows]);

  // True when we're in single-stream mode
  const isSingleStream = maxStreams === 1;

  // Initialize selectedStream from URL or sessionStorage if available
  const [selectedStream, setSelectedStream] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const streamParam = urlParams.get('stream');
    if (streamParam) {
      return streamParam;
    }
    // Check sessionStorage as a backup
    const storedStream = sessionStorage.getItem(`${storagePrefix}_selected_stream`);
    return storedStream || '';
  });

  // Initialize currentPage from URL or sessionStorage if available (URL uses 1-based indexing, internal state uses 0-based)
  const [currentPage, setCurrentPage] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pageParam = urlParams.get('page');
    if (pageParam) {
      // Convert from 1-based (URL) to 0-based (internal)
      return Math.max(0, parseInt(pageParam, 10) - 1);
    }
    // Check sessionStorage as a backup
    const storedPage = sessionStorage.getItem(`${storagePrefix}_current_page`);
    if (storedPage) {
      // Convert from 1-based (stored) to 0-based (internal)
      return Math.max(0, parseInt(storedPage, 10) - 1);
    }
    return 0;
  });

  // Check if go2rtc is enabled (for showing mode toggle)
  useEffect(() => {
    const checkGo2rtcMode = async () => {
      try {
        const go2rtcEnabled = await isGo2rtcEnabled();
        console.log(`[${logLabel}View] go2rtc enabled: ${go2rtcEnabled}`);
        setGo2rtcAvailable(go2rtcEnabled);
        // If user requested MSE via URL but go2rtc is not enabled, fall back to HLS
        if (!isWebRTC && useMSE && !go2rtcEnabled) {
          console.log('[LiveView] MSE requested but go2rtc not enabled, falling back to HLS');
          setUseMSE(false);
        }
      } catch (error) {
        console.error(`[${logLabel}View] Error checking go2rtc status:`, error);
        setGo2rtcAvailable(false);
        if (!isWebRTC) setUseMSE(false);
      }
    };
    checkGo2rtcMode();
  }, [isWebRTC, logLabel, useMSE]);

  // Fetch streams using preact-query, and periodically refresh so stream
  // status (Running / Reconnecting / Stopped etc.) stays up-to-date.
  const {
    data: streamsData,
    isLoading: isLoadingStreams,
    error: streamsError
  } = useQuery(
    'streams',
    '/api/streams',
    {
      timeout: 15000, // 15 second timeout
      retries: 2,     // Retry twice
      retryDelay: 1000 // 1 second between retries
    },
    isWebRTC ? {} : {
      refetchInterval: 30000 // Re-poll stream list (and status) every 30 s
    }
  );

  const {
    data: locationCatalog = { buildings: [] }
  } = useQuery(
    ['locations'],
    '/api/locations',
    {
      timeout: 10000,
      retries: 1,
      retryDelay: 1000
    }
  );

  // Update loading state based on streams query status
  useEffect(() => {
    setIsLoading(isLoadingStreams);
  }, [isLoadingStreams]);

  // Process streams data when it's loaded
  useEffect(() => {
    if (streamsData && Array.isArray(streamsData)) {
      // Process the streams data
      const processStreams = async () => {
        try {
          const filteredStreams = await filterStreamsForLiveView(streamsData);

          if (filteredStreams.length > 0) {
            setStreams(filteredStreams);

            // Auto-size the grid to fit the stream count when no preference is stored
            if (autoGrid) {
              const [optCols, optRows] = computeOptimalGrid(filteredStreams.length);
              setCols(optCols);
              setRows(optRows);
              setAutoGrid(false);
            }

            // Set selectedStream based on URL parameter if it exists and is valid
            const urlParams = new URLSearchParams(window.location.search);
            const streamParam = urlParams.get('stream');

            if (streamParam && filteredStreams.some(stream => stream.name === streamParam)) {
              // If the stream from URL exists in the loaded streams, use it
              setSelectedStream(streamParam);
              if (!urlStreamHydrated) {
                setWorkspaceTiles([createWorkspaceTile(streamParam)]);
                setWorkspaceStarted(true);
                setWorkspaceAutoGrid(true);
                setUrlStreamHydrated(true);
              }
            } else if (!selectedStream || !filteredStreams.some(stream => stream.name === selectedStream)) {
              // Otherwise use the first stream if selectedStream is not set or invalid
              setSelectedStream(filteredStreams[0].name);
            }
          } else {
            console.warn(`No streams available for ${logLabel} view after filtering`);
          }
        } catch (error) {
          console.error('Error processing streams:', error);
          showStatusMessage(t('live.errorProcessingStreams', { message: error.message }));
        }
      };

      processStreams();
    }
    // Note: We intentionally only re-run when streamsData changes
    // selectedStream is read but we don't want to trigger refetch when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamsData, autoGrid]);

  // Sync layout/page/stream to URL — only meaningful once streams are loaded.
  useEffect(() => {
    if (streams.length === 0) return;

    const url = new URL(window.location);

    // Page (1-based in URL, omit on first page)
    if (currentPage === 0) url.searchParams.delete('page');
    else url.searchParams.set('page', currentPage + 1);

    // cols/rows — omit from URL when at the default (2×2)
    if (cols !== 2 || rows !== 2) {
      url.searchParams.set('cols', cols);
      url.searchParams.set('rows', rows);
    } else {
      url.searchParams.delete('cols');
      url.searchParams.delete('rows');
    }
    url.searchParams.delete('layout'); // remove legacy param

    // Stream selection (single-stream mode only)
    if (isSingleStream && selectedStream) url.searchParams.set('stream', selectedStream);
    else url.searchParams.delete('stream');

    window.history.replaceState({}, '', url);

    // Persist to storage
    if (currentPage > 0) sessionStorage.setItem(`${storagePrefix}_current_page`, (currentPage + 1).toString());
    else sessionStorage.removeItem(`${storagePrefix}_current_page`);
    localStorage.setItem('lightnvr-live-cols', String(cols));
    localStorage.setItem('lightnvr-live-rows', String(rows));
    // Clean up old per-view keys so reads don't fall back to stale values
    localStorage.removeItem(`lightnvr-${storagePrefix}-cols`);
    localStorage.removeItem(`lightnvr-${storagePrefix}-rows`);
    localStorage.removeItem(`lightnvr-${storagePrefix}-layout`);
    if (isSingleStream && selectedStream) sessionStorage.setItem(`${storagePrefix}_selected_stream`, selectedStream);
    else sessionStorage.removeItem(`${storagePrefix}_selected_stream`);
  }, [currentPage, cols, rows, isSingleStream, selectedStream, streams.length]);

  // Sync UI preference controls (group, labels, controls) to URL and localStorage.
  // Runs independently of streams-loaded state so the URL is always accurate.
  useEffect(() => {
    const url = new URL(window.location);

    if (tagFilter) url.searchParams.set('tag', tagFilter);
    else url.searchParams.delete('tag');

    // Omit params when at their defaults (true) to keep URL clean
    if (!showLabels) url.searchParams.set('labels', '0');
    else url.searchParams.delete('labels');

    if (!showControls) url.searchParams.set('controls', '0');
    else url.searchParams.delete('controls');

    window.history.replaceState({}, '', url);

    // Persist to localStorage for sessions without URL
    if (tagFilter) localStorage.setItem(`lightnvr-${storagePrefix}-tag-filter`, tagFilter);
    else localStorage.removeItem(`lightnvr-${storagePrefix}-tag-filter`);
    localStorage.setItem('lightnvr-show-labels', String(showLabels));
    localStorage.setItem('lightnvr-show-controls', String(showControls));
    localStorage.setItem('lightnvr-show-detections', String(showDetections));
  }, [tagFilter, showLabels, showControls, showDetections, storagePrefix]);

  const filterStreamsForLiveView = async (sourceStreams) => {
    try {
      if (!sourceStreams || !Array.isArray(sourceStreams)) {
        console.warn('No streams data provided to filter');
        return [];
      }

      const filteredStreams = sourceStreams.filter(stream => {
        if (stream.is_deleted) {
          console.log(`Stream ${stream.name} is soft deleted, filtering out`);
          return false;
        }
        if (!stream.enabled) {
          console.log(`Stream ${stream.name} is administratively disabled, filtering out`);
          return false;
        }
        if (!stream.streaming_enabled) {
          console.log(`Stream ${stream.name} is not configured for streaming, filtering out`);
          return false;
        }
        return true;
      });

      console.log(`Filtered streams for ${logLabel} view:`, filteredStreams);
      return filteredStreams;
    } catch (error) {
      console.error(`Error filtering streams for ${logLabel} view:`, error);
      showStatusMessage(t('live.errorProcessingStreams', { message: error.message }));
      return [];
    }
  };

  const streamByName = useMemo(() => (
    new Map(streams.map((stream) => [stream.name, stream]))
  ), [streams]);

  const addWorkspaceTile = useCallback((cameraName) => {
    const cameraId = String(cameraName || '').trim();
    if (!cameraId) return;

    if (!streamByName.has(cameraId)) {
      showStatusMessage(`Camera "${cameraId}" is not available in Live View`, 'error', 5000);
      return;
    }

    setWorkspaceStarted(true);
    setWorkspaceTiles((previousTiles) => {
      if (previousTiles.length >= MAX_GRID_CELLS) {
        showStatusMessage(`Workspace is limited to ${MAX_GRID_CELLS} camera tiles`, 'error', 5000);
        return previousTiles;
      }

      return [...previousTiles, createWorkspaceTile(cameraId)];
    });
    setCurrentPage(0);
    setSelectedStream(cameraId);
  }, [streamByName]);

  const removeWorkspaceTile = useCallback((instanceId) => {
    if (!instanceId || removeTimeoutsRef.current.has(instanceId)) return;

    setRemovingTileIds((previousIds) => {
      const nextIds = new Set(previousIds);
      nextIds.add(instanceId);
      return nextIds;
    });

    const timeoutId = window.setTimeout(() => {
      setWorkspaceTiles((previousTiles) => previousTiles.filter((tile) => tile.instanceId !== instanceId));
      setRemovingTileIds((previousIds) => {
        const nextIds = new Set(previousIds);
        nextIds.delete(instanceId);
        return nextIds;
      });
      removeTimeoutsRef.current.delete(instanceId);
    }, 190);

    removeTimeoutsRef.current.set(instanceId, timeoutId);
  }, []);

  useEffect(() => () => {
    removeTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    removeTimeoutsRef.current.clear();
  }, []);

  useEffect(() => {
    const handleAddCamera = (event) => {
      addWorkspaceTile(event.detail?.cameraName);
    };

    window.addEventListener('oneberry:add-live-camera', handleAddCamera);
    return () => window.removeEventListener('oneberry:add-live-camera', handleAddCamera);
  }, [addWorkspaceTile]);

  useEffect(() => {
    if (!workspaceAutoGrid || workspaceTiles.length === 0) return;

    const targetCells = Math.min(
      MAX_GRID_CELLS,
      workspaceTiles.length <= 2 ? workspaceTiles.length : workspaceTiles.length + 1
    );
    const [optCols, optRows] = computeOptimalGrid(targetCells);
    setCols(optCols);
    setRows(optRows);
  }, [workspaceAutoGrid, workspaceTiles.length]);

  useEffect(() => {
    if (!workspaceStarted || workspaceTiles.length <= 2 || rows > 1 || cols <= 3) return;

    const targetCells = Math.min(MAX_GRID_CELLS, Math.max(4, workspaceTiles.length + 1));
    const [optCols, optRows] = computeOptimalGrid(targetCells);
    setCols(optCols);
    setRows(optRows);
    setWorkspaceAutoGrid(true);
  }, [cols, rows, workspaceStarted, workspaceTiles.length]);

  const buildingTree = useMemo(() => buildBuildingTree(
    streams,
    {
      unassignedBuilding: t('sidebar.unassignedBuilding'),
      generalArea: t('sidebar.generalArea'),
    },
    locationCatalog
  ).filter((building) => building.tag), [locationCatalog, streams, t]);
  const selectedBuilding = useMemo(() => {
    if (!tagFilter) return null;
    return buildingTree.find((building) => (
      building.tag === tagFilter || building.areas.some((area) => area.tag === tagFilter)
    )) || null;
  }, [buildingTree, tagFilter]);
  const selectedAreaTag = selectedBuilding?.areas.some((area) => area.tag === tagFilter) ? tagFilter : '';
  const selectedBuildingTag = selectedBuilding?.tag || '';

  // Apply tag filter before passing to the order hook
  const tagFilteredStreams = useMemo(() => {
    if (!tagFilter) return streams;
    return streams.filter(s => s.tags && s.tags.split(',').some(t => t.trim() === tagFilter));
  }, [streams, tagFilter]);

  // Camera ordering hook (operates on group-filtered streams)
  const {
    orderedStreams,
    reorderMode,
    toggleReorderMode,
    resetOrder,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  } = useCameraOrder(tagFilteredStreams, storagePrefix);

  // Ensure current page is valid when orderedStreams or layout changes
  useEffect(() => {
    if (workspaceTiles.length > 0) {
      const totalPages = Math.ceil(workspaceTiles.length / maxStreams);

      if (currentPage >= totalPages) {
        setCurrentPage(Math.max(0, totalPages - 1));
      }
      return;
    }

    if (orderedStreams.length === 0) return;

    const totalPages = Math.ceil(orderedStreams.length / maxStreams);

    if (currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [workspaceTiles.length, orderedStreams.length, maxStreams, currentPage]);

  /**
   * Toggle fullscreen mode for a specific stream
   * @param {string} streamName - Stream name
   * @param {Event} event - Click event
   * @param {HTMLElement} cellElement - The video cell element
   */
  const toggleStreamFullscreen = (streamName, event, cellElement) => {
    // Prevent default button behavior
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!streamName) {
      console.error('Stream name not provided for fullscreen toggle');
      return;
    }

    console.log(`Toggling fullscreen for stream: ${streamName}`);

    if (!cellElement) {
      console.error('Video cell element not provided for fullscreen toggle');
      return;
    }

    if (!document.fullscreenElement) {
      console.log('Entering fullscreen mode for video cell');
      cellElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
        showStatusMessage(isWebRTC ? `Could not enable fullscreen mode: ${err.message}` : t('live.couldNotEnableFullscreen', { message: err.message }));
      });
    } else {
      console.log('Exiting fullscreen mode');
      document.exitFullscreen();
    }

    // Prevent event propagation
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const workspaceStreamsToShow = useMemo(() => {
    if (workspaceStarted) {
      if (workspaceTiles.length === 0) {
        return [];
      }

      const totalPages = Math.ceil(workspaceTiles.length / maxStreams);

      if (currentPage >= totalPages && totalPages > 0) {
        return [];
      }

      const startIdx = currentPage * maxStreams;
      const endIdx = Math.min(startIdx + maxStreams, workspaceTiles.length);
      return workspaceTiles
        .slice(startIdx, endIdx)
        .map((tile) => {
          const stream = streamByName.get(tile.cameraId);
          return stream ? { stream, tileInstanceId: tile.instanceId } : null;
        })
        .filter(Boolean);
    }

    return [];
  }, [workspaceStarted, workspaceTiles, streamByName, currentPage, maxStreams]);

  // Memoize the streams to show to prevent unnecessary re-renders
  const streamsToShow = useMemo(() => {
    if (workspaceStarted) {
      const result = workspaceStreamsToShow.map((item) => item.stream);

      console.log(`[${logLabel}View] workspace streamsToShow computed: ${result.length} tiles`, workspaceStreamsToShow.map(item => `${item.stream.name}:${item.tileInstanceId}`));
      console.log(`[${logLabel}View] cols=${cols}, rows=${rows}, currentPage=${currentPage}, totalTiles=${workspaceTiles.length}`);
      return result;
    }

    // Filter streams based on layout and selected stream
    let result;
    if (isSingleStream && selectedStream) {
      result = orderedStreams.filter(stream => stream.name === selectedStream);
    } else {
      // Apply pagination
      const totalPages = Math.ceil(orderedStreams.length / maxStreams);

      // Ensure current page is valid
      if (currentPage >= totalPages && totalPages > 0) {
        result = []; // Will be handled by the effect that watches currentPage
      } else {
        // Get streams for current page
        const startIdx = currentPage * maxStreams;
        const endIdx = Math.min(startIdx + maxStreams, orderedStreams.length);
        result = orderedStreams.slice(startIdx, endIdx);
      }
    }

    console.log(`[${logLabel}View] streamsToShow computed: ${result.length} streams`, result.map(s => s.name));
    console.log(`[${logLabel}View] cols=${cols}, rows=${rows}, currentPage=${currentPage}, totalStreams=${orderedStreams.length}`);
    return result;
  }, [workspaceStarted, workspaceStreamsToShow, workspaceTiles.length, orderedStreams, isSingleStream, selectedStream, currentPage, maxStreams, cols, rows, logLabel]);

  // Arrow-key navigation between streams while one is in native fullscreen.
  useFullscreenGridNav(streamsToShow, cols, rows);

  const isWorkspaceMode = workspaceStarted;
  const workspaceTotalPages = Math.ceil(workspaceTiles.length / maxStreams);
  const orderedTotalPages = Math.ceil(orderedStreams.length / maxStreams);
  const visibleWorkspaceTileCount = isWorkspaceMode ? streamsToShow.length : 0;
  const workspaceEmptySlotCount = isWorkspaceMode && workspaceTiles.length > 0
    ? Math.max(0, maxStreams - streamsToShow.length)
    : 0;

  const gridHasEmptySlots = !isWorkspaceMode
    && !isLoadingStreams
    && !isLoading
    && !streamsError
    && streams.length > 0
    && streamsToShow.length > 0
    && streamsToShow.length < maxStreams;

  return (
    <section
      id="live-page"
      className={`page ${isFullscreen ? 'fullscreen-mode' : ''}`}
    >
      {/* Include the SnapshotManager component */}
      <SnapshotManager />
      {/* Include the FullscreenManager component */}
      <FullscreenManager
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
        targetId="live-page"
      />

      <div className="page-header live-toolbar flex justify-between items-center mb-4 p-4 bg-card text-card-foreground rounded-lg shadow" style={{ position: 'relative', zIndex: 10, pointerEvents: 'auto' }}>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold whitespace-nowrap">{t('live.liveView')}</h2>
          {/* View-mode tab strip: WebRTC | HLS | MSE */}
          <div className="inline-flex items-center bg-muted rounded-lg p-1 gap-1" style={{ position: 'relative', zIndex: 50 }}>
            {isWebRTC ? (
              <span className="px-3 py-1.5 rounded text-sm font-medium bg-primary text-primary-foreground select-none">
                WebRTC
              </span>
            ) : !isWebRTCDisabled && (
              <a
                href="/index.html"
                className="px-3 py-1.5 rounded text-sm font-medium transition-colors no-underline text-muted-foreground hover:bg-background hover:text-foreground focus:outline-none"
              >
                WebRTC
              </a>
            )}
            {isWebRTC ? (
              <a
                href="/hls.html"
                className="px-3 py-1.5 rounded text-sm font-medium transition-colors no-underline text-muted-foreground hover:bg-background hover:text-foreground focus:outline-none"
              >
                {t('live.hlsShort')}
              </a>
            ) : (
              <button
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors focus:outline-none ${!useMSE ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-background hover:text-foreground'}`}
                onClick={() => {
                  if (useMSE) {
                    setUseMSE(false);
                    const url = new URL(window.location);
                    url.searchParams.delete('mode');
                    window.history.replaceState({}, '', url);
                  }
                }}
              >
                {t('live.hlsShort')}
              </button>
            )}
            {go2rtcAvailable && (
              isWebRTC ? (
                <a
                  href="/hls.html?mode=mse"
                  className="px-3 py-1.5 rounded text-sm font-medium transition-colors no-underline text-muted-foreground hover:bg-background hover:text-foreground focus:outline-none"
                >
                  {t('live.mseShort')}
                </a>
              ) : (
                <button
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors focus:outline-none ${useMSE ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-background hover:text-foreground'}`}
                  onClick={() => {
                    if (!useMSE) {
                      setUseMSE(true);
                      const url = new URL(window.location);
                      url.searchParams.set('mode', 'mse');
                      window.history.replaceState({}, '', url);
                    }
                  }}
                >
                  {t('live.mseShort')}
                </button>
              )
            )}
          </div>
        </div>
        <div className="controls flex items-center space-x-2">
          {buildingTree.length > 0 && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="building-filter" className="text-sm whitespace-nowrap">{t('sidebar.buildings')}:</label>
              <select
                id="building-filter"
                className="px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
                value={selectedBuildingTag}
                onChange={(e) => { setTagFilter(e.target.value); setCurrentPage(0); }}
              >
                <option value="">{t('live.allBuildings')}</option>
                {buildingTree.map((building) => (
                  <option key={building.key} value={building.tag}>{building.name} ({building.cameraCount})</option>
                ))}
              </select>
            </div>
          )}

          {selectedBuilding?.areas?.some((area) => area.tag) && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="area-filter" className="text-sm whitespace-nowrap">{t('streamsConfig.area')}:</label>
              <select
                id="area-filter"
                className="px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
                value={selectedAreaTag}
                onChange={(e) => { setTagFilter(e.target.value || selectedBuildingTag); setCurrentPage(0); }}
              >
                <option value="">{t('live.allAreas')}</option>
                {selectedBuilding.areas.filter((area) => area.tag).map((area) => (
                  <option key={area.key} value={area.tag}>{area.name} ({area.cameras.length})</option>
                ))}
              </select>
            </div>
          )}

          {/* Grid layout picker */}
          <div className="flex items-center gap-1.5">
            <label className="text-sm whitespace-nowrap">{t('live.layout')}:</label>
            <GridPicker
              cols={cols}
              rows={rows}
              onSelect={(c, r) => { setCols(c); setRows(r); setCurrentPage(0); setAutoGrid(false); setWorkspaceAutoGrid(false); }}
              maxCells={isWorkspaceMode ? workspaceTiles.length : orderedStreams.length}
            />
          </div>

          {!isWorkspaceMode && isSingleStream && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="stream-selector" className="text-sm whitespace-nowrap">{isWebRTC ? t('live.stream') : t('nav.streams')}:</label>
              <select
                id="stream-selector"
                className="px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
                value={selectedStream}
                onChange={(e) => setSelectedStream(e.target.value)}
              >
                {orderedStreams.map(stream => (
                  <option key={stream.name} value={stream.name}>{stream.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            className={`p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary ${showLabels ? 'bg-secondary hover:bg-secondary/80 text-secondary-foreground' : 'bg-primary/20 hover:bg-primary/30 text-primary'}`}
            onClick={() => setShowLabels(v => !v)}
            title={showLabels ? t('live.hideStreamLabels') : t('live.showStreamLabels')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
              <line x1="7" y1="7" x2="7.01" y2="7"></line>
              {!showLabels && <line x1="2" y1="22" x2="22" y2="2" stroke="currentColor" strokeWidth="2"></line>}
            </svg>
          </button>

          <button
            className={`p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary ${showControls ? 'bg-secondary hover:bg-secondary/80 text-secondary-foreground' : 'bg-primary/20 hover:bg-primary/30 text-primary'}`}
            onClick={() => setShowControls(v => !v)}
            title={showControls ? t('live.hideStreamControls') : t('live.showStreamControls')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14"></line>
              <line x1="4" y1="10" x2="4" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12" y2="3"></line>
              <line x1="20" y1="21" x2="20" y2="16"></line>
              <line x1="20" y1="12" x2="20" y2="3"></line>
              <line x1="1" y1="14" x2="7" y2="14"></line>
              <line x1="9" y1="8" x2="15" y2="8"></line>
              <line x1="17" y1="16" x2="23" y2="16"></line>
              {!showControls && <line x1="2" y1="22" x2="22" y2="2" stroke="currentColor" strokeWidth="2"></line>}
            </svg>
          </button>

          <button
            className={`p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary ${showDetections ? 'bg-secondary hover:bg-secondary/80 text-secondary-foreground' : 'bg-primary/20 hover:bg-primary/30 text-primary'}`}
            onClick={() => setShowDetections(v => !v)}
            title={showDetections ? t('live.hideAllDetectionOverlays') : t('live.showAllDetectionOverlays')}
          >
            {/* Eye icon for detection overlay toggle */}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
              {!showDetections && <line x1="2" y1="22" x2="22" y2="2" stroke="currentColor" strokeWidth="2"></line>}
            </svg>
          </button>

          {!isWorkspaceMode && orderedStreams.length > 1 && (
            <button
              className={`p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary ${reorderMode ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'}`}
              onClick={toggleReorderMode}
              title={reorderMode ? t('live.exitReorderMode') : t('live.dragToReorderCameras')}
            >
              {/* Drag-handle dots icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                   fill="currentColor" stroke="none">
                <circle cx="9"  cy="5"  r="1.6"/><circle cx="15" cy="5"  r="1.6"/>
                <circle cx="9"  cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>
                <circle cx="9"  cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/>
              </svg>
            </button>
          )}

          {reorderMode && (
            <button
              className="p-2 rounded-full bg-secondary hover:bg-secondary/80 text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              onClick={resetOrder}
              title={t('live.resetCameraOrder')}
            >
              {/* Reset / circular-arrow icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
              </svg>
            </button>
          )}

          <button
            id="fullscreen-btn"
            className="p-2 rounded-full bg-secondary hover:bg-secondary/80 text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            onClick={() => toggleFullscreen()}
            title={isWebRTC ? t('live.toggleFullscreen') : t('timeline.fullscreen')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path
                d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-col space-y-4 h-full">
        <div
          id="video-grid"
          className={`video-container ${isWorkspaceMode ? 'is-workspace-grid' : gridHasEmptySlots ? 'is-partial-grid' : 'is-filled-grid'} ${visibleWorkspaceTileCount === 1 ? 'is-single-camera' : ''}`}
          style={{ '--grid-cols': cols, '--grid-rows': rows }}
          onDragOver={(event) => {
            if (reorderMode) return;
            const types = Array.from(event.dataTransfer.types || []);
            if (!types.includes('application/x-oneberry-camera')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(event) => {
            if (reorderMode) return;
            const types = Array.from(event.dataTransfer.types || []);
            if (!types.includes('application/x-oneberry-camera')) return;
            const cameraName = event.dataTransfer.getData('application/x-oneberry-camera') || event.dataTransfer.getData('text/plain');
            if (!cameraName) return;
            event.preventDefault();
            addWorkspaceTile(cameraName);
          }}
        >
          {isLoadingStreams ? (
              <div className="flex justify-center items-center col-span-full row-span-full h-64 w-full" style={{ pointerEvents: 'none', zIndex: 1 }}>
                <div className="flex flex-col items-center justify-center py-8">
                <div
                  className="inline-block animate-spin rounded-full border-4 border-secondary border-t-primary w-16 h-16"></div>
                <p className="mt-4 text-muted-foreground">{t('live.loadingStreams')}</p>
              </div>
            </div>
          ) : isLoading ? (
            <div
                className="flex justify-center items-center col-span-full row-span-full h-64 w-full"
                style={{
                  pointerEvents: 'none',
                  position: 'relative',
                  zIndex: 1
                }}
            >
              <div className="flex flex-col items-center justify-center py-8">
                <div
                  className="inline-block animate-spin rounded-full border-4 border-secondary border-t-primary w-16 h-16"></div>
                <p className="mt-4 text-muted-foreground">{t('live.loadingStreams')}</p>
              </div>
            </div>
          ) : (streamsError) ? (
            <LiveEmptyState
              t={t}
              title={t('live.unableToLoadCameraViews')}
              message={t('live.errorLoadingStreams', { message: streamsError.message })}
              actionOnClick={() => window.location.reload()}
              actionLabel={t('common.retry')}
            />
          ) : streams.length === 0 ? (
            <LiveEmptyState
              t={t}
              title={t('live.noCameraViewsTitle')}
              message={t('live.noCameraViewsMessage')}
              actionHref="streams.html"
              actionLabel={t('live.configureStreams')}
              secondaryText={t('live.noCameraViewsSecondary')}
            />
          ) : isWorkspaceMode && workspaceTiles.length === 0 ? (
            <LiveEmptyState
              t={t}
              title={t('live.emptyWorkspaceTitle')}
              message={t('live.emptyWorkspaceMessage')}
              actionHref="streams.html"
              actionLabel={t('live.manageCameras')}
              secondaryText={t('live.emptyWorkspaceSecondary')}
            />
          ) : streamsToShow.length === 0 ? (
            <LiveEmptyState
              t={t}
              title={t('live.noVisibleCameraViewsTitle')}
              message={t('live.noVisibleCameraViewsMessage')}
              secondaryText={t('live.noVisibleCameraViewsSecondary')}
            />
          ) : (
            <>
              {streamsToShow.map((stream, index) => {
                const tileInstanceId = isWorkspaceMode ? workspaceStreamsToShow[index]?.tileInstanceId : '';
                const VideoCell = isWebRTC ? WebRTCVideoCell : useMSE ? MSEVideoCell : HLSVideoCell;
                const initDelay = isWorkspaceMode
                  ? 0
                  : getLiveInitDelay({
                    isWebRTC,
                    useMSE,
                    go2rtcAvailable,
                    index,
                    totalStreams: streamsToShow.length,
                  });
                // Global index in orderedStreams for drag-and-drop (pagination offset)
                const globalIndex = currentPage * maxStreams + index;

                return (
                  <div
                    key={tileInstanceId || stream.name}
                    className={`live-workspace-tile ${removingTileIds.has(tileInstanceId) ? 'is-removing' : ''}`}
                    style={{ position: 'relative' }}
                    draggable={!isWorkspaceMode && reorderMode}
                    onDragStart={!isWorkspaceMode && reorderMode ? () => handleDragStart(globalIndex) : undefined}
                    onDragOver={!isWorkspaceMode && reorderMode ? (e) => handleDragOver(e, globalIndex) : undefined}
                    onDrop={!isWorkspaceMode && reorderMode ? handleDrop : undefined}
                    onDragEnd={!isWorkspaceMode && reorderMode ? handleDragEnd : undefined}
                  >
                    {!isWorkspaceMode && reorderMode && (
                      <div
                        style={{
                          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
                          background: 'rgba(0,0,0,0.55)', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: '6px 8px', cursor: 'grab', fontSize: '13px', gap: '6px',
                          userSelect: 'none',
                        }}
                      >
                        {/* Drag handle bars icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
                        </svg>
                        {t('live.dragToReorder')}
                      </div>
                    )}
                    {isWorkspaceMode && tileInstanceId && (
                      <button
                        type="button"
                        className="live-workspace-tile-close"
                        aria-label={`Remove ${stream.name} tile`}
                        title={`Remove ${stream.name}`}
                        onClick={() => removeWorkspaceTile(tileInstanceId)}
                      >
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    )}
                    <VideoCell
                      stream={stream}
                      onToggleFullscreen={toggleStreamFullscreen}
                      streamId={stream.name}
                      initDelay={initDelay}
                      showLabels={showLabels}
                      showControls={showControls}
                      globalShowDetections={showDetections}
                      isPageFullscreen={isFullscreen}
                    />
                  </div>
                );
              })}
            {Array.from({ length: workspaceEmptySlotCount }, (_, index) => (
              <div
                key={`workspace-empty-slot-${currentPage}-${index}`}
                className="live-workspace-slot"
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14" />
                  <rect x="3" y="6" width="12" height="12" rx="2.2" strokeWidth="1.8" />
                </svg>
                <span>{t('live.dropCameraHere')}</span>
              </div>
            ))}
            </>
          )}
        </div>

        {!isWebRTC && isFullscreen && isSingleStream && selectedStream && (
          <FullscreenTimelineOverlay
            streamName={selectedStream}
            isVisible={true}
            mode="floating"
            playbackTimestamp={null}
          />
        )}

        {isWorkspaceMode && workspaceTiles.length > maxStreams ? (
          <div className="pagination-controls flex justify-center items-center space-x-4 mt-4">
            <button
              className="btn-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
            >
              {t('common.previous')}
            </button>

            <span className="text-foreground">
              {t('live.pageOf', { current: currentPage + 1, total: workspaceTotalPages })}
            </span>

            <button
              className="btn-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setCurrentPage(Math.min(workspaceTotalPages - 1, currentPage + 1))}
              disabled={currentPage >= workspaceTotalPages - 1}
            >
              {t('common.next')}
            </button>
          </div>
        ) : !isWorkspaceMode && !isSingleStream && orderedStreams.length > maxStreams ? (
          <div className="pagination-controls flex justify-center items-center space-x-4 mt-4">
            <button
              className="btn-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                console.log('Changing to previous page');
                setCurrentPage(Math.max(0, currentPage - 1));
              }}
              disabled={currentPage === 0}
            >
              {t('common.previous')}
            </button>

            <span className="text-foreground">
              {t('live.pageOf', { current: currentPage + 1, total: orderedTotalPages })}
            </span>

            <button
              className="btn-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                console.log('Changing to next page');
                setCurrentPage(Math.min(orderedTotalPages - 1, currentPage + 1));
              }}
              disabled={currentPage >= orderedTotalPages - 1}
            >
              {t('common.next')}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
