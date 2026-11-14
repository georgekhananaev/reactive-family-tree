/*
 * The rules' own sentences in Hebrew, by the English one. This book is also
 * the list of what the rules can say: a sentence that is not here cannot be
 * said, so nothing is left untranslated by accident.
 *
 * A person's name is never bent to fit the grammar: each sentence is built so
 * that the name can stand as it is written.
 */

export const he = {
  // Names for people nobody can name
  'Unknown': 'לא ידוע',
  'Living relative': 'קרוב משפחה חי',
  'a living relative': 'קרוב משפחה חי',
  'a private relative': 'קרוב משפחה מוסתר',
  'Living relative (private)': 'קרוב משפחה חי (מוסתר)',
  'someone new': 'אדם חדש',
  'someone': 'מישהו',

  // The languages, by name and as "written in"
  'English': 'אנגלית',
  'Hebrew': 'עברית',
  'Russian': 'רוסית',
  'in English': 'באנגלית',
  'in Hebrew': 'בעברית',
  'in Russian': 'ברוסית',

  // What a change touches
  'given name': 'שם פרטי',
  'family name': 'שם משפחה',
  'birth name': 'שם משפחה בלידה',
  'story': 'סיפור',
  'sex': 'מין',
  'living': 'בחיים או לא',
  'privacy': 'פרטיות',
  'photo': 'תמונה',
  'kind': 'סוג',
  'status': 'מצב',
  'drawn with': 'מצויר ליד',
  'since': 'ביחד מאז',
  'type': 'סוג',
  'date': 'תאריך',
  'place': 'מקום',
  'detail': 'פירוט',
  'note': 'הערה',
  'certainty': 'ודאות',
  'details': 'פרטים',

  // What happened to someone
  'birth': 'לידה',
  'death': 'פטירה',
  'burial': 'קבורה',
  'residence': 'מגורים',
  'occupation': 'עיסוק',
  'education': 'השכלה',
  'immigration': 'הגירה',
  'military': 'שירות צבאי',
  'religion': 'דת',
  'custom': 'אירוע',

  // A line for each change
  'Add {name}': 'הוספת {name}',
  'Add an unnamed person': 'הוספת אדם ללא שם',
  'Change {fields} of {who}': 'שינוי בפרטים של {who}: {fields}',
  'Remove {who}': 'הסרת {who}',
  'Restore {who}': 'שחזור {who}',
  'Join {names} as partners': 'זוג חדש: {names}',
  'Change {fields} of a partnership': 'שינוי בפרטים של זוג: {fields}',
  'Remove a partnership': 'הסרת זוג',
  'Add {who} as a partner': 'הוספת {who} לזוג',
  'Remove {who} from a partnership': 'הסרת {who} מזוג',
  'Add {who} as a child': 'הוספת {who} לרשימת הילדים',
  'Remove {who} as a child': 'הסרת {who} מרשימת הילדים',
  'Add {type} for {who}': 'הוספת {type} של {who}',
  'Add a fact for {who}': 'הוספת אירוע של {who}',
  'Change {fields} of a fact': 'שינוי בפרטים של אירוע: {fields}',
  'Remove a fact': 'הסרת אירוע',
  'Add a memory of {who}': 'הוספת זיכרון על {who}',
  'Remove a memory': 'הסרת זיכרון',
  'Put something back as it was': 'החזרה למצב הקודם',
  'Write {fields} of {who} {inLanguage}': 'כתיבת {fields} של {who} {inLanguage}',
  'Write {fields} of a fact {inLanguage}': 'כתיבת {fields} של אירוע {inLanguage}',
  'Write a memory of {who} {inLanguage}': 'כתיבת זיכרון על {who} {inLanguage}',

  // Adding a relative, as the edit is named
  'Add {name} as child of {of}': 'הוספת {name}: ילד או ילדה של {of}',
  'Add {name} as partner of {of}': 'הוספת {name}: בן או בת זוג של {of}',
  'Add {name} as parent of {of}': 'הוספת {name}: הורה של {of}',
  'Add {name} as sibling of {of}': 'הוספת {name}: אח או אחות של {of}',
  'A relative is a child, partner, parent or sibling.': 'אפשר להוסיף ילד או ילדה, בן או בת זוג, הורה, אח או אחות.',
  'Add a parent first, so the two share one.': 'צריך להוסיף קודם הורה, כדי שלשניים יהיה הורה משותף.',
  'Both parents are already recorded.': 'שני ההורים כבר רשומים.',

  // A family that no longer makes sense
  'That would make {name} their own ancestor. Check who you connected.': '{name}: ככה יוצא שהאדם הזה הוא אב קדמון של עצמו. כדאי לבדוק את מי חיברת.',
  '{name} cannot have died ({died}) before being born ({born}).': '{name}: שנת הפטירה ({died}) היא לפני שנת הלידה ({born}).',
  '{name} is recorded as living {years} years.': '{name}: לפי מה שרשום, אורך החיים הוא {years} שנים.',
  '{parent} (born {parentBorn}) is recorded as a parent of {name} (born {born}).': 'שנת הלידה של ההורה {parent} ({parentBorn}) לא מוקדמת משנת הלידה של {name} ({born}).',
  '{parent} would have been {age} when {name} was born.': '{parent}: גיל {age} בזמן הלידה של {name}.',
  '{name} looks like someone already on the tree. Same person?': '{name}: נראה שכבר יש מישהו כזה בעץ. זה אותו אדם?',

  // Why a change was not simply saved
  'This is outside your branch, so it goes to that branch’s steward for review.': 'זה מחוץ לענף שלך, אז השינוי עובר לבדיקה אצל מי שאחראי על הענף ההוא.',
  'Connecting someone from another branch changes that branch too, so it needs review.': 'חיבור של מישהו מענף אחר משנה גם את הענף ההוא, אז צריך בדיקה.',
  'Only undo can put things back.': 'אפשר להחזיר דברים למצב הקודם רק דרך ביטול.',
  'A photo can be added by the person themselves, their branch’s steward or an admin.': 'תמונה יכולים להוסיף האדם עצמו, אחראי הענף שלו או מנהל.',
  'Sign in to suggest a change.': 'צריך להתחבר כדי להציע שינוי.',
  'Sign in to share a memory.': 'צריך להתחבר כדי לשתף זיכרון.',
  'The family will look at it.': 'המשפחה תבדוק את זה.',
  'Only a living person can choose to be public, from their own account.': 'רק אדם חי יכול לבחור להיות גלוי לכולם, מהחשבון שלו.',
  'Only its author, the person it is about, or a steward can remove a memory.': 'רק מי שכתב את הזיכרון, מי שהזיכרון עליו או אחראי ענף יכולים להסיר אותו.',
  'Only its author, the person it is about, or a steward can write a memory in another language.': 'רק מי שכתב את הזיכרון, מי שהזיכרון עליו או אחראי ענף יכולים לכתוב אותו בשפה אחרת.',
  'A new person has to be connected to someone in your branch.': 'אדם חדש צריך להיות מחובר למישהו בענף שלך.',
  'Removing your own leaf needs an admin.': 'רק מנהלים יכולים להסיר את העלה שלך.',
  'Removing someone who has children on the tree needs an admin.': 'רק מנהלים יכולים להסיר מישהו שיש לו ילדים בעץ.',
  'Restoring from the compost needs an admin.': 'רק מנהלים יכולים לשחזר מהקומפוסט.',
  'A photo is saved at once or not at all. Save it apart from the changes that need review.': 'תמונה נשמרת מיד, או שלא נשמרת בכלל. צריך לשמור אותה בנפרד מהשינויים שהולכים לבדיקה.',
} as const;
