const DAY = 86400000;
const BEIJING_OFFSET = 8 * 3600000;

export function nextMidnight(now = Date.now()) {
  return (Math.floor((now + BEIJING_OFFSET) / DAY) + 1) * DAY - BEIJING_OFFSET;
}

// An application-owned schedule: no page visit or browser needs to be running.
export function startNightlySync(service, { now = Date.now, schedule = setTimeout, cancel = clearTimeout, log = console.log } = {}) {
  let stopped = false;
  let timer;
  function arm() {
    if (stopped) return;
    const target = nextMidnight(now());
    log(`Nightly sync scheduled: ${new Date(target).toISOString()} (Asia/Shanghai 00:00)`);
    timer = schedule(async () => {
      try {
        await service.refreshAll();
        const errors = service.databaseStatus().categories.filter(category => category.last_error);
        log(`Nightly sync finished; failed categories: ${errors.length}`);
      } catch (error) { log(`Nightly sync failed: ${error.message}`); }
      finally { arm(); }
    }, target - now());
    timer?.unref?.();
  }
  arm();
  return () => { stopped = true; cancel(timer); };
}
