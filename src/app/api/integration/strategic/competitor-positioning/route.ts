import { retiredVisibilityEndpoint } from '@/lib/visibility/retired-endpoint';

export async function GET() { return retiredVisibilityEndpoint('/compare'); }
