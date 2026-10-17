import { retiredVisibilityEndpoint } from '@/lib/visibility/retired-endpoint';

export async function GET() { return retiredVisibilityEndpoint('/content'); }
export async function PATCH() { return retiredVisibilityEndpoint('/content'); }
export async function DELETE() { return retiredVisibilityEndpoint('/content'); }
