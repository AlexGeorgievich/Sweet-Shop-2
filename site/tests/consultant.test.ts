import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureSalesQuestion, normalizeConversation, parseConsultantResponse } from '../app/lib/consultant.ts';

test('keeps only the latest valid conversation messages', () => {
  const history = normalizeConversation([
    { role: 'assistant', content: 'old' },
    ...Array.from({ length: 9 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `message-${index}` })),
    { role: 'system', content: 'ignore me' },
    { role: 'user', content: '  latest  ' },
  ]);

  assert.equal(history.length, 8);
  assert.equal(history.at(-1)?.content, 'latest');
  assert.ok(history.every((message) => message.role === 'user' || message.role === 'assistant'));
});

test('extracts purchase intent and order summary without exposing metadata', () => {
  const result = parseConsultantResponse('Отлично, подберём торт к свадьбе. Перейти к форме заказа ниже?\n<consultant_meta>{"orderIntent":true,"summary":"Свадебный торт; 20 гостей; светлое оформление"}</consultant_meta>');
  assert.equal(result.orderIntent, true);
  assert.equal(result.summary, 'Свадебный торт; 20 гостей; светлое оформление');
  assert.equal(result.answer.includes('consultant_meta'), false);
});

test('keeps a normal answer safe when model metadata is missing', () => {
  const result = parseConsultantResponse('Расскажите, на какую дату нужен торт?');
  assert.equal(result.orderIntent, false);
  assert.equal(result.summary, '');
  assert.equal(result.answer, 'Расскажите, на какую дату нужен торт?');
});

test('ensures a consultant answer ends with a purchase-oriented question', () => {
  assert.match(ensureSalesQuestion('У нас есть торты на заказ.'), /У нас есть торты на заказ\.[\s\S]*\?$/);
  assert.equal(ensureSalesQuestion('Какой вкус вам нравится?'), 'Какой вкус вам нравится?');
});
