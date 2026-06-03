function parseScriptArgs(args, defaults, argSpecMap) {
  const config = { ...defaults };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const spec = argSpecMap[arg];
    if (!spec) {
      continue;
    }

    const targetKey = spec.key || arg.replace(/^--/, '');

    if (spec.type === 'boolean') {
      config[targetKey] = true;
      continue;
    }

    const value = args[i + 1];
    if (value === undefined) {
      continue;
    }

    if (typeof spec.parse === 'function') {
      config[targetKey] = spec.parse(value);
    } else {
      config[targetKey] = value;
    }

    i += 1;
  }

  return config;
}

async function drawDetectionZoneInCanvas({
  zoneEditorDialog,
  points,
  sleep,
  clickDelayMs = 250,
  completeButtonText = /Complete Zone/i,
  completeButtonClickTimeoutMs = 3000,
  logger,
}) {
  const canvas = zoneEditorDialog.locator('canvas').first();
  let box = null;

  for (let i = 0; i < 20; i++) {
    box = await canvas.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      break;
    }
    await sleep(500);
  }

  if (!box) {
    return { drawn: false, boxFound: false };
  }

  const zonePoints = typeof points === 'function' ? points(box) : points;

  if (!Array.isArray(zonePoints) || zonePoints.length === 0) {
    return { drawn: false, boxFound: true, completed: false };
  }

  for (const point of zonePoints) {
    await canvas.click({ position: { x: point.x, y: point.y } });
    await sleep(clickDelayMs);
  }

  try {
    const completeButton = zoneEditorDialog
      .locator('button')
      .filter({ hasText: completeButtonText })
      .first();
    await completeButton.waitFor({ timeout: completeButtonClickTimeoutMs });
    await completeButton.click();
    await sleep(1000);

    return { drawn: true, boxFound: true, completed: true };
  } catch (error) {
    if (typeof logger === 'function') {
      logger(`Could not click Complete Zone button: ${error.message}`);
    }

    return { drawn: true, boxFound: true, completed: false };
  }
}

module.exports = {
  parseScriptArgs,
  drawDetectionZoneInCanvas,
};
