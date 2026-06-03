import { drawDetectionsOnCanvas } from './DetectionOverlay.jsx';
import { showStatusMessage } from './ToastContainer.jsx';
import { formatFilenameTimestamp } from '../../utils/date-utils.js';

export function createPrivacyHandlers({
  stream,
  t,
  queryClient,
  setIsTogglingEnabled,
  setPrivacyActive,
  setShowPrivacyConfirm,
}) {
  const handlePauseForPrivacy = async () => {
    setIsTogglingEnabled(true);
    try {
      const res = await fetch(`/api/streams/${encodeURIComponent(stream.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set_privacy_mode: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPrivacyActive(true);
      setShowPrivacyConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['streams'] });
    } catch (err) {
      showStatusMessage(`${t('live.pauseForPrivacy')}: ${err.message}`, 'error', 5000);
      setShowPrivacyConfirm(false);
    } finally {
      setIsTogglingEnabled(false);
    }
  };

  const handleResumeFromPrivacy = async () => {
    setIsTogglingEnabled(true);
    try {
      const res = await fetch(`/api/streams/${encodeURIComponent(stream.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set_privacy_mode: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPrivacyActive(false);
      queryClient.invalidateQueries({ queryKey: ['streams'] });
    } catch (err) {
      showStatusMessage(`${t('live.resumeStream')}: ${err.message}`, 'error', 5000);
    } finally {
      setIsTogglingEnabled(false);
    }
  };

  return { handlePauseForPrivacy, handleResumeFromPrivacy };
}

export function captureVideoSnapshot({
  videoElement,
  detectionOverlay,
  streamName,
  t,
}) {
  if (!videoElement) return;

  if (!videoElement.videoWidth || !videoElement.videoHeight) {
    showStatusMessage(t('live.cannotTakeSnapshotVideoNotLoaded'), 'error');
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  if (detectionOverlay && typeof detectionOverlay.getDetections === 'function') {
    const detections = detectionOverlay.getDetections();
    if (detections && detections.length > 0) {
      drawDetectionsOnCanvas(ctx, canvas.width, canvas.height, detections);
    }
  }

  const timestamp = formatFilenameTimestamp();
  const fileName = `snapshot-${streamName.replace(/\s+/g, '-')}-${timestamp}.jpg`;

  canvas.toBlob((blob) => {
    if (!blob) {
      showStatusMessage(t('timeline.failedToCreateSnapshot'), 'error');
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(blobUrl);
    }, 1000);

    showStatusMessage(t('live.snapshotSaved', { fileName }), 'success', 2000);
  }, 'image/jpeg', 0.95);
}
