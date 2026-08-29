export interface InflectionInput {
  value: string;
  group: string | null;
  name: string | null;
  exact: boolean;
}

export interface EntryInput {
  id: string;
  headword: string;
  lookupValue: string | null;
  sortKey: string;
  definitionHtml: string;
  partOfSpeech: string | null;
  pronunciation: string | null;
  spoilerAfterBook: number | null;
  inflections: InflectionInput[];
}

export interface BookInput {
  ordinal: number;
  title: string;
}

export interface SeriesInput {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  inLanguage: string;
  outLanguage: string;
  books: BookInput[];
}
