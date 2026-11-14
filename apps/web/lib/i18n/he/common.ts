/*
 * The page's words in Hebrew: what many parts of the page share, and the
 * small pieces of the page around the tree. A sentence used in more than one
 * part of the page lives here, once.
 *
 * The same words are used for the same things everywhere, in both books:
 *
 *   English          Hebrew                Russian
 *   tree             עץ                    дерево
 *   leaf             עלה                   лист
 *   branch           ענף                   ветвь
 *   steward          אחראי ענף             хранитель ветви
 *   owner            בעלים                 владелец
 *   admin            מנהל                  администратор
 *   member           משתתף                 участник
 *   visitor          אורח                  гость
 *   relative         קרוב משפחה            родственник
 *   partner          בן או בת זוג          супруг или супруга (пара: пара)
 *   edit             עריכה, עדכון          правка
 *                    (עריכה is the button and the act, עדכון is one saved set of changes)
 *   draft            טיוטה                 черновик
 *   suggestion       הצעה                  предложение
 *   review           בדיקה                 проверка
 *   compost          קומפוסט               компост
 *   story            סיפור                 история
 *   memory           זיכרון                воспоминание
 *   fact             אירוע                 событие
 *   inbox            תיבת דואר             входящие
 *   passkey          מפתח גישה             ключ доступа
 *   sign in          התחברות / להתחבר      вход / войти
 *   invite           הזמנה / להזמין        приглашение / пригласить
 *   translation      תרגום                 перевод
 *
 * A few more words that are kept the same everywhere in Hebrew: email is
 * מייל, a token is טוקן, to apply a draft is אישור, to discard is מחיקה, to
 * withdraw a suggestion is ביטול ההצעה, the history of changes is
 * היסטוריית שינויים (a person's story is סיפור), setting a tree up is הקמה.
 *
 * Hebrew addresses the reader without choosing between "you" for a man and
 * for a woman: nouns on buttons ("שמירה"), "אפשר ל…" and "צריך ל…", what
 * people do in general ("מקישים על עלה"), and the words that are written the
 * same for everyone ("שלך", "לך", "קיבלת"). It speaks the way people do:
 * "צריך להתחבר" and not "יש להתחבר", "מייל" and not "דוא״ל".
 * A person's name is never bent: sentences are built so it stands as written.
 */

export const common = {
  // ---------- Everywhere ----------
  'Save': 'שמירה',
  'Cancel': 'ביטול',
  'Close': 'סגירה',
  'Done': 'סיום',
  'Back': 'חזרה',
  'Continue': 'המשך',
  'Remove': 'הסרה',
  'Edit': 'עריכה',
  'Undo': 'ביטול פעולה',
  'Copy': 'העתקה',
  'Copied': 'הועתק',
  'Try again': 'לנסות שוב',
  'One moment…': 'רק רגע…',
  'Something went wrong.': 'משהו השתבש.',
  'The server cannot be reached. Check that it is still running.': 'אין חיבור לשרת. כדאי לבדוק שהוא עדיין פועל.',
  'Saved': 'נשמר',
  'Nothing changed': 'שום דבר לא השתנה',
  'Unknown': 'לא ידוע',
  'Living relative': 'קרוב משפחה חי',
  'today, {time}': 'היום ב-{time}',
  'born {year}': 'לידה: {year}',
  'died {year}': 'פטירה: {year}',
  '{born} to {died}': '{born}–{died}',

  // ---------- Languages ----------
  'Language': 'שפה',
  'English': 'אנגלית',
  'Hebrew': 'עברית',
  'Russian': 'רוסית',
  'in English': 'באנגלית',
  'in Hebrew': 'בעברית',
  'in Russian': 'ברוסית',
  'Choose a language': 'בחירת שפה',
  'Written {inLanguage}, not yet in yours.': 'כתוב רק {inLanguage}, עוד לא בשפה שלך.',
  'Written from an earlier version. It may be out of date.': 'תורגם מגרסה קודמת, ואולי כבר לא מעודכן.',

  // ---------- Pages that stand alone ----------
  'This page does not exist': 'הדף הזה לא קיים',
  'The link may be old, or mistyped.': 'אולי הקישור ישן, או שיש בו טעות.',
  'Go to the tree': 'מעבר לעץ',
  'Something went wrong': 'משהו השתבש',
  'The page could not be shown. Try again, or go back to the tree.': 'לא הצלחנו להציג את הדף. אפשר לנסות שוב, או לחזור לעץ.',
  'The family tree could not be loaded': 'לא הצלחנו לטעון את עץ המשפחה',
  'The server did not answer. It may be starting, or the connection may be down.': 'השרת לא עונה. אולי הוא עדיין עולה, או שהחיבור נפל.',

  // ---------- A photo ----------
  'See the photo of {name} larger': 'הגדלת התמונה של {name}',
  'Photo of {name}': 'התמונה של {name}',
  'Close the photo': 'סגירת התמונה',

  // ---------- About ----------
  'About Reactive Family Tree, version {version}': 'אודות Reactive Family Tree, גרסה {version}',
  'Version {version}': 'גרסה {version}',
  ', build {build}': ', בנייה {build}',
  ' of {day}': ' מ-{day}',
  'The software that the {family} tree runs on. Each family runs a copy of its own, on a server it chose.': 'התוכנה שעליה רץ העץ של {family}. לכל משפחה יש עותק משלה, על שרת שהיא בחרה.',
  'Made by {maker}, and free for anyone to use under the MIT licence.': 'פיתוח: {maker}. התוכנה חופשית לשימוש לכולם, ברישיון MIT.',
  'Source on GitHub': 'קוד המקור ב-GitHub',
  'What changed in each version': 'מה השתנה בכל גרסה',
  'Something wrong with the software? Write to {address}': 'משהו לא עובד בתוכנה? אפשר לכתוב ל-{address}',
  'Privacy': 'פרטיות',
  'References': 'מקורות',
  'What a family puts on its tree is kept where that family chose to keep it. The software sends nothing to its maker.': 'מה שמשפחה מעלה לעץ שלה נשמר במקום שהיא בחרה. התוכנה לא שולחת שום דבר למי שפיתח אותה.',
  'There is no advertising and no tracking, and the pages load nothing from other companies.': 'אין פרסומות ואין מעקב, והדפים לא טוענים שום דבר מחברות אחרות.',
  'Living people are never shown to visitors unless they choose it themselves.': 'אנשים חיים לא מוצגים לאורחים אף פעם, אלא אם הם בחרו בזה בעצמם.',
  'Cookies are used only for signing in and for remembering the language. Choices such as light or dark stay in your browser.': 'עוגיות משמשות רק להתחברות ולזכירת השפה. בחירות כמו בהיר או כהה נשארות בדפדפן שלך.',
  'Email addresses are used to sign in and to invite relatives. The mail goes out through the service this family set up.': 'כתובות מייל משמשות להתחברות ולהזמנת קרובי משפחה. המיילים נשלחים דרך השירות שהמשפחה הגדירה.',
  'A relative may connect an AI assistant of their own, where the family allows it. It can see and do only what that relative can.': 'קרובי משפחה יכולים לחבר עוזר בינה מלאכותית משלהם, אם המשפחה מאפשרת. העוזר רואה ועושה רק מה שמותר למי שחיבר אותו.',
  'Whoever runs this tree decides who may see it, and can correct or remove anything kept here. Questions about the tree itself go to them.': 'מי שמפעיל את העץ הזה מחליט מי יכול לראות אותו, ויכול לתקן או להסיר כל דבר שנשמר בו. שאלות על העץ עצמו כדאי להפנות אליו.',
  'Literata, by TypeTogether, and Source Sans, by Adobe: the two typefaces, under the SIL Open Font License. Frank Ruhl Libre and Assistant draw the Hebrew letters.': 'Literata של TypeTogether ו-Source Sans של Adobe: שני הגופנים, ברישיון SIL Open Font License. האותיות בעברית כתובות בגופנים Frank Ruhl Libre ו-Assistant.',
  'The Astronomical Almanac, for the sums that place the sun and the moon.': 'האלמנך האסטרונומי (The Astronomical Almanac), לחישוב המקום של השמש ושל הירח בשמיים.',
  'GEDCOM, the file format that family history programs share, and the Model Context Protocol, by which an AI assistant connects.': 'GEDCOM, פורמט הקבצים המשותף לתוכנות של עצי משפחה, ו-Model Context Protocol, שדרכו מתחבר עוזר בינה מלאכותית.',
  'Next.js, React, SQLite and Better Auth, which the app is built with.': 'Next.js, React, SQLite ו-Better Auth, שעליהם האפליקציה בנויה.',
} as const;
