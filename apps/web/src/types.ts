export type DataMode = 'fixture' | 'baseline' | 'live_qloo';
export type Stage = 'START' | 'PARSING' | 'CONFIRM' | 'SEARCHING' | 'RESULTS' | 'REFINING' | 'REFINED' | 'SELECTED';
export interface Constraints { cuisines: string[]; ambience: string[]; partySize: number | null; budgetMax: number | null; currency: string | null; maxWalkMinutes: number | null; allergens: string[]; excludeSpicy: boolean }
export interface Gap { nutrient: string; missingAmount: number; unit: string; level: string; sourceType: string }
export interface Interpretation { confirmationText: string; constraints: Constraints; nutritionGap: Gap; needsClarification: boolean; clarificationQuestion: string | null; parserMode: string; notice: string }
export interface Recommendation { candidateId: string; qlooEntityId: string | null; rank: number; placeName: string; menuName: string; price: number; currency: string; walkMinutes: number; tasteFit: string; nutritionContribution: { proteinG: number | null; fiberG: number | null; fatG: number | null }; reason: string[]; allergenStatus: string; allergens: string[]; provenance: Record<string,string> }
export interface Results { dataMode: DataMode; candidateSource: string; qlooUsed: boolean; recommendations: Recommendation[]; constraints: Constraints; appliedChanges: {field: string; from: unknown; to: unknown}[]; comparison: {candidateIds: string[]; withTaste: string[]; withoutTaste: string[]; label: string}; trace: {tool: string; status: string; mode: string}[]; emptyMessage: string | null }
export interface Selection { selected: boolean; recommendation: Recommendation; twinMessage: string; preview: Record<string,unknown> }
export interface ApiError {code: string; message: string; requestId?: string; retryable: boolean}
