/* The page's words in Hebrew: the card part. The words used for the same things everywhere are listed in he/common.ts. */

export const card = {
  // ---------- The card ----------
  'Person': 'אדם',
  'Unsaved changes': 'שינויים שלא נשמרו',
  'Leave without saving?': 'לצאת בלי לשמור?',
  'Keep editing': 'להמשיך לערוך',
  'Saving…': 'שומר…',
  'Details are private': 'הפרטים מוסתרים',
  'Living people are shown only to relatives who sign in.': 'אנשים חיים מוצגים רק לקרובי משפחה שהתחברו.',

  // ---------- Someone only suggested or drafted so far ----------
  'A draft, not on the tree yet': 'טיוטה, עדיין לא בעץ',
  'Suggested by {name}': 'הצעה של {name}',
  'Only you can see this until you apply it.': 'רק לך זה מוצג, עד שהטיוטה תאושר.',
  'Waiting for a steward or admin to decide.': 'בהמתנה להחלטה של אחראי ענף או מנהל.',
  'Review the draft': 'בדיקת הטיוטה',
  'Review it': 'בדיקת ההצעה',
  'See the suggestion': 'הצגת ההצעה',

  // ---------- Reading a person ----------
  // A date in words follows ("בערך 1890", "4 במרץ 1921"), so it stands after a colon
  'born {date}': 'לידה: {date}',
  'died {date}': 'פטירה: {date}',
  // When the way between the two is too long to name. {sex} is the person's on the card
  'related to you': '{sex?קרובת משפחה שלך|קרוב משפחה שלך|קרוב משפחה שלך}',
  'This is you': 'זה העלה שלך',
  '{name} suggests: {changes}': 'הצעה של {name}: {changes}',
  '“{note}”': '״{note}״',
  'Family': 'משפחה',
  // {names} are the relatives, already listed; {n} is how many; {sex} is the person's on the card
  'Child of {names}': '{sex?בת של {names}|בן של {names}|הורים: {names}}',
  'Partner of {name}': '{sex?בת הזוג של|בן הזוג של|בזוגיות עם} {name}',
  'Partner of {name} since {year}': '{sex?בת הזוג של|בן הזוג של|בזוגיות עם} {name} מאז {year}',
  'Was partner of {name}': '{sex?בת הזוג לשעבר של|בן הזוג לשעבר של|בעבר בזוגיות עם} {name}',
  'Was partner of {name} since {year}': '{sex?בת הזוג לשעבר של|בן הזוג לשעבר של|בעבר בזוגיות עם} {name}, משנת {year}',
  '{n#Child:|Children:} {names}': '{n#{them?בת|בן|ילדים}|{them?בנות|בנים|ילדים}}: {names}',
  '{n#Sibling:|Siblings:} {names}': '{n#{them?אחות|אח|אחים ואחיות}|{them?אחיות|אחים|אחים ואחיות}}: {names}',
  'Nobody is connected yet.': 'עדיין לא מחובר לכאן אף אחד.',
  'Memories': 'זיכרונות',
  'History': 'היסטוריית שינויים',
  // Before the kinds of relative that can be added: child, partner, parent, sibling
  'Add a': 'הוספה:',
  // After words shown in another language. {language} is always the reader's own
  'Write it in {language}': 'תרגום ל{language}',

  // ---------- Memories ----------
  'Add memory': 'הוספת זיכרון',
  'Memory added': 'הזיכרון נוסף',
  'A memory of {name}': 'זיכרון על {name}',
  'A memory of {name}, in {language}': 'זיכרון על {name}, ב{language}',
  'Share a memory of {name}': 'יש לך זיכרון על {name}? אפשר לשתף כאן',
  'Share a memory of them': 'יש לך זיכרון? אפשר לשתף כאן',
  // A memory told in another language, told again in the reader's own
  'Tell it in {language}': 'לספר את הזיכרון ב{language}',

  // ---------- The kinds of fact ----------
  'birth': 'לידה',
  'death': 'פטירה',
  'burial': 'קבורה',
  'residence': 'מגורים',
  'occupation': 'עיסוק',
  'education': 'השכלה',
  'immigration': 'הגירה',
  'military': 'שירות צבאי',
  'religion': 'דת',
  'custom': 'אירוע אחר',

  // ---------- Editing a person ----------
  'Changes are published at once': 'השינויים נכנסים לעץ מיד',
  'Changes go to a steward for review': 'השינויים נשלחים לבדיקה של אחראי ענף',
  'Send for review': 'שליחה לבדיקה',
  'Really remove?': 'להסיר באמת?',
  'Born': 'תאריך לידה',
  'Died': 'תאריך פטירה',
  'Birthplace': 'מקום לידה',
  // Examples of how a date may be typed. The date box understands them in Hebrew too
  'about 1890, March 1921, 4 March 1921': 'בערך 1890, מרץ 1921, 4 במרץ 1921',
  'Female': 'נקבה',
  'Male': 'זכר',
  'Not known': 'לא ידוע',
  'Yes': 'כן',
  'No': 'לא',
  'Who can see this person': 'מי יכול לראות את האדם הזה',
  'Follow the family’s setting': 'לפי ההגדרה של המשפחה',
  'Relatives only': 'קרובי משפחה בלבד',
  'Public, even while living': 'גלוי לכולם, גם בחיים',
  'Other facts': 'אירועים נוספים',
  'When': 'מתי',
  'Where': 'איפה',
  '{kind}: detail': '{kind}: פירוט',
  '{kind}: when': '{kind}: מתי',
  '{kind}: where': '{kind}: איפה',
  'Add a fact…': 'הוספת אירוע…',
  'Add a fact': 'הוספת אירוע',
  'New fact: detail': 'אירוע חדש: פירוט',
  'New fact: when': 'אירוע חדש: מתי',
  'New fact: where': 'אירוע חדש: איפה',
  'How certain': 'כמה זה בטוח',
  'Certain': 'בטוח',
  'Probable': 'כנראה',
  'Uncertain': 'לא בטוח',
  'A note for the reviewer': 'הערה למי שבודק',
  'How do you know? A document, a gravestone, a memory': 'מאיפה זה ידוע? מסמך, מצבה, זיכרון',
  // Takes words written in another language into the box, as they are
  'Use this text': 'להשתמש בטקסט הזה',
  // The edit's name, as history lists it
  'Update {name}': 'עדכון הפרטים של {name}',
  'Correct {name}': 'תיקון בפרטים של {name}',
  'Remove {name}': 'הסרת {name}',
  '{name} moved to the compost': '{name} עכשיו בקומפוסט',

  // ---------- Adding a relative ----------
  'Add a child': 'הוספת ילד או ילדה',
  'Add a partner': 'הוספת בן או בת זוג',
  'Add a parent': 'הוספת הורה',
  'Add a sibling': 'הוספת אח או אחות',
  // Which of the person's partnerships a new child belongs to
  'Child': 'ילד או ילדה',
  'with {name}': 'עם {name}',
  'with no recorded partner': 'בלי הורה נוסף בעץ',
  'Enter at least a given name.': 'צריך לפחות שם פרטי.',
  'A year, or as exactly as you know': 'שנה, או תאריך מדויק אם ידוע',
  'Leave empty if living': 'אם עדיין בחיים, משאירים ריק',
  'Only what you know. The rest can be added later.': 'רק מה שידוע. את השאר אפשר להוסיף אחר כך.',
  'This is outside your branch, so it will be sent for review.': 'זה מחוץ לענף שלך, אז זה יישלח לבדיקה.',

  // ---------- A date box ----------
  'Read as {date}': 'הבנו כך: {date}',
  'Not read as a date. Kept as you wrote it.': 'לא הצלחנו לקרוא את זה כתאריך. זה יישמר כמו שנכתב.',

  // ---------- A photo in the edit form ----------
  'Photo': 'תמונה',
  'Add a photo': 'הוספת תמונה',
  'Change photo': 'החלפת תמונה',
  'Remove photo': 'הסרת התמונה',
  'Place the face in the circle. Drag, or use the arrow keys. Plus and minus zoom.': 'ממקמים את הפנים בתוך העיגול: בגרירה, או במקשי החיצים. פלוס ומינוס מגדילים ומקטינים.',
  'Drag the photo so the face sits in the circle.': 'גוררים את התמונה עד שהפנים בתוך העיגול.',
  'Use this photo': 'להשתמש בתמונה הזו',
  'That file could not be opened as a photo. Try a JPEG or a PNG.': 'לא הצלחנו לפתוח את הקובץ הזה כתמונה. אפשר לנסות קובץ JPEG או PNG.',

  // ---------- A person's own page ----------
  'Not found': 'לא נמצא',
  'Born in {place}': 'מקום לידה: {place}',
  'partner of {names}': '{sex?בת הזוג של|בן הזוג של|בזוגיות עם} {names}',
  '{n## child|# children}': '{n#ילד אחד|שני ילדים|# ילדים}',
  '{name} on the {family} tree.': '{name} בעץ של {family}.',
  'Born {date}': 'לידה: {date}',
  'Born {date}, {place}': 'לידה: {date}, {place}',
  'Parents': 'הורים',
  'Partner': '{partner?בת זוג|בן זוג|בן או בת זוג}',
  'Former partner': '{partner?בת זוג לשעבר|בן זוג לשעבר|בן או בת זוג לשעבר}',
  ', since {year}': ', משנת {year}',
  'Children': 'ילדים',
  'Brothers and sisters': 'אחים ואחיות',
  'See {name} on the tree': 'לראות את {name} בעץ',
  'See them on the tree': 'לראות בעץ',
} as const;
