export const collectionAllergens = ['milk', 'egg', 'peanut', 'tree_nut', 'fish', 'crustacean', 'sesame', 'wheat', 'soy', 'mango', 'other'] as const;
export const avoidedFoods = ['cilantro', 'scallion', 'ginger', 'garlic', 'pork', 'beef', 'lamb', 'offal_blood', 'fish_seafood', 'alcohol', 'other'] as const;
export type SelectionStatus = 'unknown' | 'none' | 'selected';
export type DietaryPreferences = {
    city: string;
    allergyStatus: SelectionStatus; allergens: string[]; allergyOther: string;
    avoidanceStatus: SelectionStatus; avoidedFoods: string[]; avoidanceOther: string;
};
export const emptyDietary: DietaryPreferences = { city: '', allergyStatus: 'unknown', allergens: [], allergyOther: '', avoidanceStatus: 'unknown', avoidedFoods: [], avoidanceOther: '' };
export type HealthSnapshot = {
    weightKg: number; heightCm: number; bodyFatStatus: 'unknown' | 'measured'; bodyFatPct: number | null;
    goal: 'build_muscle' | 'lose_fat' | 'wellness' | 'no_specific_goal'; chronotype: 'morning' | 'evening' | 'intermediate';
    breakfastHabit: 'often' | 'sometimes' | 'never'; lunchHabit: 'often' | 'sometimes' | 'never'; dinnerHabit: 'often' | 'sometimes' | 'never';
};
export type HealthRecord = HealthSnapshot & { id: string; recordedAt: string; bmi: number };
export type HealthPage = { records: HealthRecord[]; nextOffset: number | null };
export type HealthDraft = { [Key in keyof HealthSnapshot]: string };
export const emptyHealth: HealthDraft = { weightKg: '', heightCm: '', bodyFatStatus: '', bodyFatPct: '', goal: '', chronotype: '', breakfastHabit: '', lunchHabit: '', dinnerHabit: '' };
export function healthDraft(record: HealthSnapshot): HealthDraft {
    return Object.fromEntries(Object.entries(record).filter(([key]) => key in emptyHealth).map(([key, value]) => [key, value === null ? '' : String(value)])) as HealthDraft;
}
export type NotebookSession = { cuisines: string[] };
export const emptyNotebookSession: NotebookSession = { cuisines: [] };
export const cuisineGroups = [
    { id: 'asia', values: ['Japanese', 'Chinese', 'Korean', 'Thai', 'Vietnamese', 'Indian', 'Indonesian', 'Malaysian', 'Singaporean'] },
    { id: 'europe', values: ['Italian', 'French', 'Spanish', 'Greek', 'German', 'British'] },
    { id: 'americas', values: ['Mexican', 'American', 'Brazilian', 'Peruvian'] },
    { id: 'middleEast', values: ['Turkish', 'Lebanese', 'Persian'] },
    { id: 'africa', values: ['Moroccan', 'Ethiopian'] },
] as const;