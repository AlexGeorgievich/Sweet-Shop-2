'use client';

import Image from 'next/image';
import { CSSProperties, FormEvent, useEffect, useRef, useState } from 'react';
import { shouldShowWheelOnPageLoad } from '@/app/lib/wheel-display';
import ConsultantWidget from '@/app/components/consultant-widget';
import { CONSULTANT_REOPEN_DELAY, ORDER_RELOAD_DELAY, shouldScheduleWheel, WHEEL_AFTER_CONSULTANT_DELAY } from '@/app/lib/consultant-timing';
import { OrderFieldErrors, validateOrder } from '@/app/lib/order-validation';

type SubmitState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'success'; orderId: string; notificationDelivered: boolean }
  | { status: 'error'; message: string };

const desserts = [
  { name: 'Торты на заказ', note: 'Начинка, декор и настроение — специально для вашего события', price: 'от 2 700 ₽ / кг', image: '/photo/hero-premium.png' },
  { name: 'Воздушное безе', note: 'Хрустящая корочка, нежная сердцевина и сливочный вкус', price: 'от 180 ₽ / шт.', image: '/photo/pexels-hilmiisilak-28399451.jpg' },
  { name: 'Заварные пирожные', note: 'Тонкое тесто и много крема — классика, которую любят все', price: 'от 260 ₽ / шт.', image: '/photo/pexels-connorscottmcmanus-14823408.jpg' },
  { name: 'Пончики и сладости', note: 'Яркие маленькие радости для детских и семейных праздников', price: 'от 220 ₽ / шт.', image: '/photo/pexels-n-voitkevich-6942169.jpg' },
  { name: 'Порционные торты', note: 'Аккуратная подача и любимые начинки для красивого стола', price: 'от 350 ₽ / шт.', image: '/photo/pexels-nadezhda-moryak-4409269.jpg' },
  { name: 'Круассаны с кремом', note: 'Хрустящие слои, воздушный крем и аромат свежей выпечки', price: 'от 290 ₽ / шт.', image: '/photo/pexels-samet-burak-daglioglu-574092183-31799933.jpg' },
];

const reviews = [
  { text: 'Торт стал настоящим украшением праздника. Нежный, в меру сладкий — гости просили добавку и контакты кондитера.', author: 'Анна', occasion: 'торт на день рождения' },
  { text: 'Всё получилось именно так, как мы представляли: от оттенка крема до начинки. Очень бережное общение и точность ко времени.', author: 'Мария', occasion: 'свадебный заказ' },
  { text: 'Заказывали набор в подарок. Упаковка красивая, десерты свежие, а впечатление — будто подарок собирали для близкого человека.', author: 'Елена', occasion: 'подарочный набор' },
];

const wheelPrizes = [
  { short: '−15%', title: 'Скидка 15%', note: 'на первый заказ' },
  { short: '−10%', title: 'Скидка 10%', note: 'на любой десерт' },
  { short: '+3', title: 'Три капкейка', note: 'в подарок к торту' },
  { short: 'Декор', title: 'Праздничный декор', note: 'топпер и свечи в подарок' },
  { short: 'Доставка', title: 'Бесплатная доставка', note: 'по Самаре' },
];

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function Home() {
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [fieldErrors, setFieldErrors] = useState<OrderFieldErrors>({});
  const [selectedDessert, setSelectedDessert] = useState('');
  const [consultantSummary, setConsultantSummary] = useState('');
  const [wheelOpen, setWheelOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [prizeIndex, setPrizeIndex] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(300);
  const wheelScheduledRef = useRef(false);
  const wheelTimerRef = useRef<number | null>(null);
  const orderIdempotencyKeyRef = useRef<string | null>(null);
  const activePrize = prizeIndex !== null && secondsLeft > 0 ? wheelPrizes[prizeIndex] : null;

  useEffect(() => {
    if (!shouldShowWheelOnPageLoad(sessionStorage.getItem('sweet-story-wheel-seen'))) return;
    const showWheelAfterConsultant = (event: Event) => {
      const closeCount = (event as CustomEvent<{ closeCount?: number }>).detail?.closeCount ?? 0;
      if (!shouldScheduleWheel(closeCount) || wheelScheduledRef.current) return;
      wheelScheduledRef.current = true;
      const delay = CONSULTANT_REOPEN_DELAY + WHEEL_AFTER_CONSULTANT_DELAY;
      wheelTimerRef.current = window.setTimeout(() => {
        window.dispatchEvent(new Event('wheel-opening'));
        setWheelOpen(true);
      }, delay);
    };
    const storeConsultantSummary = (event: Event) => {
      const summary = (event as CustomEvent<{ summary?: string }>).detail?.summary?.trim().slice(0, 1_200) ?? '';
      if (summary) setConsultantSummary(summary);
    };
    const showWheelForOrderIntent = (event: Event) => {
      storeConsultantSummary(event);
      if (wheelTimerRef.current !== null) window.clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = null;
      wheelScheduledRef.current = true;
      window.dispatchEvent(new Event('wheel-opening'));
      setWheelOpen(true);
    };
    window.addEventListener('consultant-closed', showWheelAfterConsultant);
    window.addEventListener('consultant-summary', storeConsultantSummary);
    window.addEventListener('consultant-order-intent', showWheelForOrderIntent);
    return () => {
      window.removeEventListener('consultant-closed', showWheelAfterConsultant);
      window.removeEventListener('consultant-summary', storeConsultantSummary);
      window.removeEventListener('consultant-order-intent', showWheelForOrderIntent);
      if (wheelTimerRef.current !== null) window.clearTimeout(wheelTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (prizeIndex === null || secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [prizeIndex, secondsLeft]);

  useEffect(() => {
    if (!wheelOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !spinning) closeWheel();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [wheelOpen, spinning]);

  function closeWheel() {
    setWheelOpen(false);
  }

  function spinWheel() {
    if (spinning || prizeIndex !== null) return;
    const winningIndex = Math.floor(Math.random() * wheelPrizes.length);
    const sectorAngle = 360 / wheelPrizes.length;
    const finalAngle = 1800 + (360 - (winningIndex * sectorAngle + sectorAngle / 2));
    setSpinning(true);
    setWheelRotation((value) => value + finalAngle);
    window.setTimeout(() => {
      setPrizeIndex(winningIndex);
      setSecondsLeft(300);
      setSpinning(false);
    }, 3900);
  }

  function claimPrize() {
    closeWheel();
    window.setTimeout(() => document.getElementById('order')?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const values = Object.fromEntries(formData.entries());
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
    const errors = validateOrder(values, today);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSubmitState({ status: 'error', message: 'Проверьте выделенные поля.' });
      const firstInvalid = form.querySelector<HTMLElement>(`[name="${Object.keys(errors)[0]}"]`);
      firstInvalid?.focus();
      return;
    }
    setSubmitState({ status: 'sending' });
    orderIdempotencyKeyRef.current ??= crypto.randomUUID();

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': orderIdempotencyKeyRef.current,
        },
        body: JSON.stringify(values),
      });
      const result = await response.json() as { orderId?: string; notificationDelivered?: boolean; error?: string; fields?: OrderFieldErrors };

      if (!response.ok || !result.orderId) {
        if (result.fields) setFieldErrors(result.fields);
        throw new Error(result.error || 'Не удалось отправить заявку. Попробуйте ещё раз.');
      }

      form.reset();
      setSelectedDessert('');
      setFieldErrors({});
      setSecondsLeft(0);
      orderIdempotencyKeyRef.current = null;
      setSubmitState({ status: 'success', orderId: result.orderId, notificationDelivered: result.notificationDelivered !== false });
      window.dispatchEvent(new Event('order-submitted'));
      window.setTimeout(() => window.location.reload(), ORDER_RELOAD_DELAY);
    } catch (error) {
      setSubmitState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Не удалось отправить заявку. Попробуйте ещё раз.',
      });
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Сладкая история — на главную"><span className="brand-mark">СИ</span><span><b>Сладкая история</b><small>Кондитерская · Самара</small></span></a>
        <nav aria-label="Основная навигация"><a href="#catalog">Десерты</a><a href="#about">О нас</a><a href="#reviews">Отзывы</a></nav>
        <a className="header-action" href="#order">Заказать десерт <span>→</span></a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow hero-eyebrow"><span /> Кондитерская ручной работы · Самара</p>
          <h1>Торт, который гости<br /><em>будут вспоминать</em></h1>
          <p className="hero-lead">Создадим для вашего праздника десерт с любимой начинкой, живыми ягодами и оформлением, которое хочется рассматривать до первого кусочка.</p>
          <div className="hero-actions"><a className="button primary hero-primary" href="#order">Рассчитать мой десерт <span>↗</span></a><a className="button text-button" href="#catalog">Смотреть каталог <span>↓</span></a></div>
          <div className="hero-notes"><span>Натуральный состав</span><span>Декор под вашу идею</span><span>Готовим к выбранной дате</span></div>
        </div>
        <div className="hero-visual">
          <div className="image-frame"><Image src="/photo/hero-premium.png" alt="Аппетитный клубничный чизкейк ручной работы" fill priority sizes="(max-width: 850px) 92vw, 46vw" /><div className="image-caption"><small>Вкус, в который влюбляются</small><b>Клубничный чизкейк</b></div></div>
        </div>
      </section>

      <section className="catalog section" id="catalog">
        <div className="section-heading"><div><p className="eyebrow">Наша витрина</p><h2>Десерты для ваших <em>особенных дней</em></h2></div><p>Каждый десерт готовим под заказ, чтобы к вашему столу он приехал свежим и безупречным.</p></div>
        <div className="catalog-grid">
          {desserts.map((dessert, index) => (
            <article className="dessert-card" key={dessert.name}>
              <div className="dessert-image"><Image src={dessert.image} alt={`${dessert.name} ручной работы`} fill sizes="(max-width: 700px) 92vw, (max-width: 1050px) 45vw, 30vw" /><span>0{index + 1}</span><b>{dessert.price}</b></div>
              <div className="dessert-copy"><h3>{dessert.name}</h3><p>{dessert.note}</p><a href="#order" onClick={() => setSelectedDessert(dessert.name)} aria-label={`Заказать ${dessert.name}`}>Хочу попробовать <span>→</span></a></div>
            </article>
          ))}
        </div>
        <p className="price-note">Цены указаны для базового оформления. Финальная стоимость зависит от начинки, веса и декора.</p>
      </section>

      <section className="about section" id="about">
        <div className="about-intro"><p className="eyebrow">Почему выбирают нас</p><h2>В десертах важен не только вкус, <em>но и чувство</em></h2><p>Мы бережно превращаем вашу идею в десерт, который хочется рассматривать, фотографировать и делить с близкими.</p></div>
        <div className="about-gallery">
          <div className="about-photo about-photo-main"><Image src="/photo/pexels-travel-with-lenses-734723610-38876021.jpg" alt="Яркие макарон ручной работы" fill sizes="(max-width: 850px) 70vw, 26vw" /></div>
          <div className="about-photo about-photo-small"><Image src="/photo/pexels-mrpugo-34807011.jpg" alt="Клубничный чизкейк с живыми ягодами" fill sizes="(max-width: 850px) 44vw, 14vw" /></div>
        </div>
        <div className="benefits-grid">
          <article><span>01</span><h3>Честный состав</h3><p>Сливочное масло, натуральные сливки, ягоды и шоколад — без заменителей и готовых смесей.</p></article>
          <article><span>02</span><h3>Ваше настроение</h3><p>Подбираем начинку, палитру и декор так, чтобы десерт продолжал историю вашего события.</p></article>
          <article><span>03</span><h3>Свежесть к дате</h3><p>Не готовим впрок: собираем заказ специально для вас и передаём точно к празднику.</p></article>
          <article><span>04</span><h3>Забота в деталях</h3><p>Продумываем упаковку и перевозку, чтобы десерт добрался до стола таким, каким вышел из мастерской.</p></article>
        </div>
      </section>

      <section className="process section">
        <div className="section-heading compact"><div><p className="eyebrow">Всё просто</p><h2>От идеи до первого <em>кусочка</em></h2></div><p>Для точного расчёта расскажите о событии, дате, количестве гостей и желаемом оформлении.</p></div>
        <ol className="steps">
          <li><span>1</span><div><h3>Расскажите о празднике</h3><p>Оставьте заявку и поделитесь идеей, референсами или просто настроением.</p></div></li>
          <li><span>2</span><div><h3>Согласуем детали</h3><p>Подберём начинку, вес и оформление, рассчитаем итоговую стоимость.</p></div></li>
          <li><span>3</span><div><h3>Создадим десерт</h3><p>Приготовим всё к выбранной дате и бережно упакуем для передачи.</p></div></li>
        </ol>
      </section>

      <section className="reviews section" id="reviews">
        <div className="reviews-title"><p className="eyebrow">Тёплые слова</p><h2>Истории наших <em>гостей</em></h2></div>
        <div className="reviews-grid">{reviews.map((review) => <blockquote key={review.author + review.occasion}><span className="quote">“</span><p>{review.text}</p><footer><b>{review.author}</b><small>{review.occasion}</small></footer></blockquote>)}</div>
      </section>

      <section className="order section" id="order">
        <div className="order-copy">
          <p className="eyebrow">Давайте начнём</p><h2>Расскажите о своём <em>празднике</em></h2><p>Заполните короткую форму. Мы уточним детали и только после этого назовём точную стоимость — без обязательств и скрытых доплат.</p>
          <div className="order-photo"><Image src="/photo/pexels-mrpugo-34807011.jpg" alt="Домашний десерт с кремом и свежими ягодами" fill sizes="(max-width: 850px) 100vw, 42vw" /><div className="order-photo-caption">Начинка, ради которой хочется ещё кусочек</div></div>
          <div className="contact-list"><div><small>Телефон</small><b>+7 (___) ___-__-__</b></div><div><small>Мессенджеры</small><b>Telegram · WhatsApp</b></div><div><small>Город</small><b>Самара</b></div></div>
          <p className="contact-placeholder">Контактные ссылки будут добавлены перед публикацией.</p>
        </div>
        <div className="order-form-column">
        <form className="order-form" noValidate onSubmit={handleSubmit} onChange={() => { if (submitState.status !== 'sending') setSubmitState({ status: 'idle' }); setFieldErrors({}); }}>
          <div className="form-heading"><span className="form-icon" aria-hidden="true">✦</span><div><h3>Заявка на торт</h3><p>Заполнение займёт около двух минут</p></div></div>
          <div className="form-divider" />
          {consultantSummary && <label className="consultant-summary-card"><span>Консультант подготовил для менеджера</span><textarea name="consultantSummary" rows={4} value={consultantSummary} onChange={(event) => setConsultantSummary(event.target.value)} /></label>}
          <input type="hidden" name="prize" value={activePrize?.title ?? ''} />
          <label className="form-trap" aria-hidden="true">Ваш сайт<input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>
          <div className="field-row"><label>Ваше имя<input name="name" type="text" placeholder="Как к вам обращаться" required aria-invalid={Boolean(fieldErrors.name)} />{fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}</label><label>Телефон<input name="phone" type="tel" placeholder="+7 900 000-00-00" required aria-invalid={Boolean(fieldErrors.phone)} />{fieldErrors.phone && <small className="field-error">{fieldErrors.phone}</small>}</label></div>
          <div className="field-row"><label>Какой торт нужен<select name="dessert" value={selectedDessert} onChange={(event) => setSelectedDessert(event.target.value)} required aria-invalid={Boolean(fieldErrors.dessert)}><option value="" disabled>Выберите из каталога</option>{desserts.map((dessert) => <option key={dessert.name}>{dessert.name}</option>)}</select>{fieldErrors.dessert && <small className="field-error">{fieldErrors.dessert}</small>}</label><label>Дата праздника<input name="date" type="date" required aria-invalid={Boolean(fieldErrors.date)} />{fieldErrors.date && <small className="field-error">{fieldErrors.date}</small>}</label></div>
          <div className="field-row field-row-single"><label>Количество гостей<input name="guests" type="number" min="1" max="500" defaultValue="10" required aria-invalid={Boolean(fieldErrors.guests)} />{fieldErrors.guests && <small className="field-error">{fieldErrors.guests}</small>}</label></div>
          <label>Пожелания<textarea name="details" rows={4} placeholder="Расскажите о начинке, оформлении и важных деталях" required aria-invalid={Boolean(fieldErrors.details)} />{fieldErrors.details && <small className="field-error">{fieldErrors.details}</small>}</label>
          <label className="consent"><input name="consent" type="checkbox" required aria-invalid={Boolean(fieldErrors.consent)} /><span>Согласен(на) на обработку данных для связи по заказу</span></label>
          {fieldErrors.consent && <small className="field-error consent-error">{fieldErrors.consent}</small>}
          <button className="button primary form-button" type="submit" disabled={submitState.status === 'sending'} aria-busy={submitState.status === 'sending'}>
            {submitState.status === 'sending' ? 'Отправляем заявку…' : 'Хочу такой десерт'} <span>{submitState.status === 'sending' ? '•••' : '→'}</span>
          </button>
          <div className="form-status" aria-live="polite" aria-atomic="true">
            {submitState.status === 'success' && <p className="form-success"><b>Заявка сохранена!</b><span>Номер заказа: {submitState.orderId}. {submitState.notificationDelivered ? 'Наш менеджер получил уведомление и свяжется с вами в ближайшее время.' : 'Уведомление в Telegram пока не доставлено, но заявка надёжно сохранена на сервере.'} Страница обновится через 5 секунд.</span></p>}
            {submitState.status === 'error' && <p className="form-error"><b>Не получилось отправить заявку</b><span>{submitState.message} Введённые данные сохранены в форме.</span></p>}
          </div>
        </form>
        {activePrize && <a className="order-prize order-prize-reminder" href="#order"><span>Ваша скидка закреплена</span><b>{activePrize.title}</b><small>Осталось {formatTime(secondsLeft)}</small></a>}
        </div>
      </section>

      <footer className="site-footer"><a className="brand footer-brand" href="#top"><span className="brand-mark">СИ</span><span><b>Сладкая история</b><small>Кондитерская · Самара</small></span></a><p>Десерты, которые становятся частью тёплых воспоминаний.</p><a href="#top">Наверх ↑</a></footer>

      {wheelOpen && (
        <div className="wheel-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !spinning && closeWheel()}>
          <div className="wheel-dialog" role="dialog" aria-modal="true" aria-labelledby="wheel-title">
            <button className="wheel-close" type="button" onClick={closeWheel} disabled={spinning} aria-label="Закрыть рулетку">×</button>
            <div className="wheel-copy">
              <p className="eyebrow">Подарок для вашего праздника</p>
              {prizeIndex === null ? (
                <>
                  <h2 id="wheel-title">Крутите колесо — <em>подарок точно ваш</em></h2>
                  <p>Каждый сектор выигрышный. После вращения у вас будет 5 минут, чтобы закрепить подарок за заявкой.</p>
                  <button className="button wheel-button" type="button" onClick={spinWheel} disabled={spinning}>{spinning ? 'Колесо вращается…' : 'Крутить колесо'} <span>↗</span></button>
                  <small>Один подарок на одну заявку. Без регистрации.</small>
                </>
              ) : secondsLeft > 0 ? (
                <div className="wheel-result" aria-live="polite">
                  <span>Поздравляем!</span>
                  <h2 id="wheel-title">{wheelPrizes[prizeIndex].title}</h2>
                  <p>{wheelPrizes[prizeIndex].note}. Подарок будет автоматически добавлен к заявке.</p>
                  <div className="wheel-timer"><small>Подарок закреплён ещё</small><b>{formatTime(secondsLeft)}</b></div>
                  <button className="button wheel-button" type="button" onClick={claimPrize}>Забрать подарок <span>→</span></button>
                </div>
              ) : (
                <div className="wheel-result">
                  <span>Время вышло</span>
                  <h2 id="wheel-title">Предложение завершено</h2>
                  <p>Вы всё ещё можете оставить заявку — мы подберём лучший вариант под ваш праздник.</p>
                  <button className="button wheel-button" type="button" onClick={claimPrize}>Перейти к заявке <span>→</span></button>
                </div>
              )}
            </div>
            <div className="wheel-stage" aria-hidden="true">
              <div className="wheel-pointer">▼</div>
              <div className={`fortune-wheel${spinning ? ' is-spinning' : ''}`} style={{ transform: `rotate(${wheelRotation}deg)` }}>
                {wheelPrizes.map((prize, index) => {
                  const angle = index * 72 + 36;
                  return <span className="wheel-label" key={prize.title} style={{ transform: `rotate(${angle}deg) translateY(-116px) rotate(-${angle}deg)` } as CSSProperties}><b>{prize.short}</b></span>;
                })}
                <span className="wheel-hub">СИ</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConsultantWidget />
    </main>
  );
}
