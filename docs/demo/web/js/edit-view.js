/*
 * One edit, shown the same way everywhere: in the review inbox, in a person's
 * history, in a draft from an AI. Plain sentences, each change as before and after.
 */

import { parseDate } from '/core/dates.js';
import { h, when } from './dom.js';

const FIELD_LABELS = {
  given: 'Given name', family: 'Family name', birthName: 'Born as', sex: 'Sex', living: 'Living', bio: 'Story', privacy: 'Privacy',
  date: 'Date', place: 'Place', value: 'Detail', note: 'Note', certainty: 'Certainty', since: 'Since', status: 'Status', kind: 'Kind', host: 'Drawn with',
};
const STATUS_LABELS = { draft: 'Draft', suggested: 'Waiting for review', declined: 'Declined', withdrawn: 'Withdrawn', reverted: 'Undone', applied: '' };
/* Fields a reviewer can retype before approving. The rest are choices, not text. */
const ADJUSTABLE = new Set(['given', 'family', 'birthName', 'bio', 'date', 'place', 'value', 'note']);

/*
 * options:
 *   selectable  show a checkbox per change (for applying part of a draft)
 *   adjusting   let the reviewer retype values before approving
 *   actions     buttons for the foot of the card
 * Returns the element. `element.chosen()` gives the ticked changes, and
 * `element.adjusted()` the changes with the reviewer's values.
 */
export function editCard(edit, { selectable = false, adjusting = false, actions = [] } = {}) {
  const boxes = [];
  const inputs = [];
  const fromAi = edit.origin === 'mcp';
  const status = STATUS_LABELS[edit.status];

  const lines = edit.lines.map((line, index) => {
    const title = line.text;
    const box = selectable ? h('input', { type: 'checkbox', checked: true }) : null;
    if (box) boxes.push(box);
    const changes = line.fields.map((change) => {
      const editable = adjusting && ADJUSTABLE.has(change.field);
      const control = editable ? h('input', { type: 'text', value: change.to }) : h('span', { class: 'to', text: change.to || 'empty' });
      if (editable) inputs.push({ index, field: change.field, control });
      return [
        h('span', { class: 'field', text: FIELD_LABELS[change.field] ?? change.field }),
        h('span', {},
          change.was !== undefined && h('span', { class: 'was', text: change.was || 'empty' }), change.was !== undefined && ' ', control,
          change.now !== undefined && h('span', { class: 'now', text: ` (is now ${change.now || 'empty'})` })),
      ];
    });
    return h('li', {}, box ? h('label', { class: 'check' }, box, title) : title, changes.length ? h('div', { class: 'change' }, changes) : null);
  });

  const card = h('article', { class: `edit${edit.status === 'suggested' || edit.status === 'draft' ? ' waiting' : ''}`, 'data-edit': edit.id },
    h('header', {}, h('strong', { text: edit.message || 'An edit' }), h('small', { text: when(edit.appliedAt ?? edit.createdAt) })),
    h('p', { class: 'by' },
      `${edit.author}${edit.byVisitor ? ' (a visitor)' : ''} `,
      fromAi && h('span', { class: 'status ai', text: `with AI${edit.client ? `, ${edit.client}` : ''}` }), ' ',
      status && h('span', { class: 'status', text: status }),
      edit.reviewedBy && edit.status === 'applied' && ` Approved by ${edit.reviewedBy}.`),
    edit.note && h('p', { class: 'note', text: edit.note }),
    h('ul', {}, lines),
    edit.warnings.map((warning) => h('p', { class: 'warning', text: warning.message })),
    edit.status === 'declined' && edit.reviewNote && h('p', { class: 'note', text: `${edit.reviewedBy}: ${edit.reviewNote}` }),
    edit.comments.map((comment) => h('p', { class: 'comment' }, h('b', { text: `${comment.author}: ` }), comment.body)),
    actions.length ? h('div', { class: 'form-actions' }, actions) : null);

  card.chosen = () => boxes.map((box, index) => (box.checked ? index : -1)).filter((index) => index >= 0);
  card.adjusted = () => {
    const ops = structuredClone(edit.ops);
    for (const { index, field, control } of inputs) ops[index].set[field] = field === 'date' ? parseDate(control.value) : control.value.trim();
    return ops;
  };
  return card;
}
