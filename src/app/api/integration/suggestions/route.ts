import { retiredVisibilityEndpoint } from '@/lib/visibility/retired-endpoint';

export async function GET() { return retiredVisibilityEndpoint('/content'); }
export async function POST() { return retiredVisibilityEndpoint('/content'); }
