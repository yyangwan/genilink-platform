import { retiredVisibilityEndpoint } from '@/lib/visibility/retired-endpoint';

export async function POST() { return retiredVisibilityEndpoint('/trends'); }
