import type { MeasurementHistory } from '@/types/measurement-history';

export function scopeMeasurements(results: MeasurementHistory['results'], stale: boolean): MeasurementHistory['results'] {
  return results.map(item => {
    const current = item.snapshot_current && !stale;
    return { ...item, snapshot_current: current, platforms: item.platforms.map(platform => ({ ...platform, metrics: platform.metrics.map(metric => current ? metric : { ...metric, difference: null, interval95: null }) })) };
  });
}
