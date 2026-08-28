const baseCss = String.raw`
[data-mt-cart-theme="v1"] {
  --mt-cart-accent: #ffd500;
  --mt-cart-ink: #1f1f1f;
  --mt-cart-muted: #6f747d;
  --mt-cart-line: #e4e6ea;
  --mt-cart-soft: #f7f8fa;
  --mt-cart-desktop-width: 1180px;
  --mt-cart-product-row-height: 100px;
  --mt-cart-card-width: 240px;
  --mt-cart-card-image-height: 270px;
  --mt-cart-mobile-card-width: 166px;
}

@media (min-width: 1024px) {
  [data-mt-cart-overlay="v1"][data-mt-cart-overlay-open="true"] {
    box-sizing: border-box !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 12px !important;
    overflow: hidden !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] {
    box-sizing: border-box !important;
    position: relative !important;
    inset: auto !important;
    width: min(var(--mt-cart-desktop-width), calc(100vw - 24px)) !important;
    min-width: 0 !important;
    max-width: calc(100vw - 24px) !important;
    height: min(820px, calc(100dvh - 24px)) !important;
    min-height: min(620px, calc(100dvh - 24px)) !important;
    max-height: calc(100dvh - 24px) !important;
    margin: auto !important;
    padding: 0 !important;
    transform: none !important;
    overflow: visible !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .popup-block {
    box-sizing: border-box !important;
    width: 100% !important;
    min-width: 0 !important;
    height: 100% !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    padding: 22px 26px 20px !important;
    border-radius: 12px !important;
    overflow: hidden !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .popup-close {
    top: 17px !important;
    right: 19px !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .popup-title {
    flex: 0 0 auto !important;
    min-height: 38px !important;
    margin: 0 0 12px !important;
    padding: 0 48px 0 0 !important;
    color: var(--mt-cart-ink) !important;
    font-size: 30px !important;
    line-height: 1.2 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart {
    box-sizing: border-box !important;
    min-width: 0 !important;
    min-height: 0 !important;
    flex: 1 1 auto !important;
    display: grid !important;
    grid-template-columns: minmax(420px, 43fr) minmax(0, 57fr) !important;
    grid-template-rows: minmax(0, 1fr) auto !important;
    gap: 16px 18px !important;
    overflow: hidden !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-content {
    box-sizing: border-box !important;
    width: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    height: 100% !important;
    max-height: none !important;
    grid-column: 1 !important;
    grid-row: 1 / 3 !important;
    position: relative !important;
    border: 1px solid var(--mt-cart-line) !important;
    border-radius: 10px !important;
    overflow: hidden !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-items {
    width: 100% !important;
    height: 100% !important;
    max-height: 100% !important;
    display: block !important;
    border: 0 !important;
    table-layout: fixed !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain !important;
    scrollbar-gutter: stable !important;
    scrollbar-width: thin !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-items > thead {
    display: none !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-section {
    box-sizing: border-box !important;
    width: 100% !important;
    max-height: none !important;
    display: block !important;
    padding: 8px 8px 0 !important;
    overflow-x: hidden !important;
    overflow-y: visible !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-item {
    box-sizing: border-box !important;
    width: 100% !important;
    min-width: 0 !important;
    min-height: var(--mt-cart-product-row-height) !important;
    height: var(--mt-cart-product-row-height) !important;
    display: grid !important;
    grid-template-columns: 68px minmax(0, 1fr) 106px !important;
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr) !important;
    align-items: center !important;
    border: 1px solid #eceef1 !important;
    border-radius: 9px !important;
    background: #fff !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-item .cart-cell {
    box-sizing: border-box !important;
    width: auto !important;
    min-width: 0 !important;
    height: 100% !important;
    display: flex !important;
    align-items: center !important;
    padding: 8px 10px !important;
    border: 0 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-item .cart-cell.__image {
    grid-column: 1 !important;
    grid-row: 1 / 3 !important;
    position: relative !important;
    justify-content: center !important;
    padding: 6px !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-image {
    width: 56px !important;
    height: 70px !important;
    display: grid !important;
    place-items: center !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-image img {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-remove {
    z-index: 3 !important;
    top: 4px !important;
    left: 4px !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-title {
    width: 100% !important;
    margin: 0 !important;
    color: var(--mt-cart-ink) !important;
    font-size: 14px !important;
    line-height: 1.3 !important;
    overflow: hidden !important;
    display: -webkit-box !important;
    -webkit-box-orient: vertical !important;
    -webkit-line-clamp: 2 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-container {
    margin: 6px 0 0 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-price {
    color: var(--mt-cart-muted) !important;
    font-size: 13px !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-item > .cart-cell.__details {
    grid-column: 2 !important;
    grid-row: 1 / 3 !important;
    align-content: center !important;
    flex-direction: column !important;
    align-items: flex-start !important;
    justify-content: center !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-item > .cart-cell.__quantity {
    grid-column: 3 !important;
    grid-row: 2 !important;
    padding: 2px 8px 8px !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-item > .cart-cell.__cost {
    grid-column: 3 !important;
    grid-row: 1 !important;
    padding: 8px 8px 2px !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-quantity,
  .popup.__cart[data-mt-cart-theme="v1"] .counter--large {
    width: 100% !important;
    max-width: 104px !important;
    margin: 0 auto !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-cost {
    width: 100% !important;
    color: var(--mt-cart-ink) !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    text-align: right !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-foot {
    box-sizing: border-box !important;
    width: 100% !important;
    min-width: 0 !important;
    grid-column: 2 !important;
    grid-row: 2 !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
    position: static !important;
    padding: 16px !important;
    border: 1px solid var(--mt-cart-line) !important;
    border-radius: 14px !important;
    background: var(--mt-cart-soft) !important;
    box-shadow: none !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-foot > tr {
    width: 100% !important;
    display: block !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-foot > tr:first-child {
    order: 2 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-foot > tr:last-child {
    order: 1 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-foot > tr > .cart-cell.__image {
    display: none !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-foot > tr > .cart-cell:not(.__image) {
    box-sizing: border-box !important;
    width: 100% !important;
    display: block !important;
    padding: 0 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-discount {
    width: 100% !important;
    min-height: 26px !important;
    height: auto !important;
    display: flex !important;
    align-items: center !important;
    padding: 0 !important;
    border: 0 !important;
    overflow: hidden !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-discount-l,
  .popup.__cart[data-mt-cart-theme="v1"] .cart-discount-info {
    width: 100% !important;
    margin: 0 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-discount .j-coupon-add {
    color: var(--mt-cart-muted) !important;
    font-size: 13px !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-discount-coupon,
  .popup.__cart[data-mt-cart-theme="v1"] .cart-discount-coupon .coupon {
    box-sizing: border-box !important;
    width: 100% !important;
    min-width: 0 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-footer {
    box-sizing: border-box !important;
    width: 100% !important;
    min-height: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: auto 46px !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 0 !important;
    border: 0 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-summary {
    grid-column: 1 !important;
    grid-row: 1 !important;
    width: 100% !important;
    display: flex !important;
    align-items: baseline !important;
    justify-content: space-between !important;
    gap: 12px !important;
    margin: 0 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-footer-h,
  .popup.__cart[data-mt-cart-theme="v1"] .cart-footer-b {
    margin: 0 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-footer-b {
    font-size: 20px !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-buttons {
    box-sizing: border-box !important;
    grid-column: 1 !important;
    grid-row: 2 !important;
    width: 100% !important;
    height: 46px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: stretch !important;
    gap: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-buttons::before,
  .popup.__cart[data-mt-cart-theme="v1"] .cart-buttons::after {
    content: none !important;
    display: none !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-btnBack,
  .popup.__cart[data-mt-cart-theme="v1"] .cart-btnOrder {
    width: auto !important;
    height: 42px !important;
    float: none !important;
    margin: 0 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-btnBack {
    display: none !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-btnOrder {
    width: 100% !important;
    height: 46px !important;
    display: block !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-btnOrder .btn {
    box-sizing: border-box !important;
    width: 100% !important;
    min-width: 0 !important;
    height: 46px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 9px !important;
    padding: 0 24px !important;
    background: var(--mt-cart-accent) !important;
    color: var(--mt-cart-ink) !important;
    font-weight: 600 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .j-cart-additional,
  .popup.__cart[data-mt-cart-theme="v1"] .cart-recommended {
    box-sizing: border-box !important;
    width: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    height: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    margin: 0 !important;
    overflow: hidden !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .j-cart-additional {
    grid-column: 2 !important;
    grid-row: 1 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-recommended {
    padding: 16px !important;
    border: 1px solid var(--mt-cart-line) !important;
    border-radius: 14px !important;
    background: #fff !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-recommended > .h3 {
    flex: 0 0 auto !important;
    margin: 0 0 12px !important;
    color: var(--mt-cart-ink) !important;
    font-size: 20px !important;
    line-height: 1.25 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .cart-recommended-items,
  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider,
  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-container {
    box-sizing: border-box !important;
    width: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    height: 100% !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-container {
    overflow: hidden !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-container::before,
  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-container::after {
    width: 58px !important;
    z-index: 8 !important;
    pointer-events: none !important;
    transition: opacity .18s ease !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider:has(.slideCarousel-nav-btn.__slideLeft.__disabled) .productsSlider-container::before,
  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider:has(.slideCarousel-nav-btn.__slideLeft:disabled) .productsSlider-container::before,
  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider:has(.slideCarousel-nav-btn.__slideRight.__disabled) .productsSlider-container::after,
  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider:has(.slideCarousel-nav-btn.__slideRight:disabled) .productsSlider-container::after {
    opacity: 0 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-wrapper {
    width: max-content !important;
    height: 100% !important;
    min-height: 0 !important;
    max-height: 100% !important;
    display: flex !important;
    align-items: stretch !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-i {
    box-sizing: border-box !important;
    width: var(--mt-cart-card-width) !important;
    min-width: var(--mt-cart-card-width) !important;
    max-width: var(--mt-cart-card-width) !important;
    height: 100% !important;
    min-height: 0 !important;
    flex: 0 0 var(--mt-cart-card-width) !important;
    display: flex !important;
    flex-direction: column !important;
    margin-right: 14px !important;
    padding: 12px !important;
    border: 1px solid #dde1e7 !important;
    border-radius: 14px !important;
    background: #fff !important;
    box-shadow: 0 1px 2px rgba(18, 25, 38, .04) !important;
    overflow: hidden !important;
    transition: border-color .18s ease, box-shadow .18s ease !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-i:hover {
    border-color: #cfd4dc !important;
    box-shadow: 0 8px 22px rgba(18, 25, 38, .09) !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-i > a {
    box-sizing: border-box !important;
    width: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    flex: 1 1 auto !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-image {
    box-sizing: border-box !important;
    width: 100% !important;
    height: auto !important;
    min-height: 100px !important;
    max-height: var(--mt-cart-card-image-height) !important;
    flex: 1 1 var(--mt-cart-card-image-height) !important;
    display: grid !important;
    place-items: center !important;
    margin: 0 !important;
    border: 1px solid #eef0f3 !important;
    border-radius: 11px !important;
    padding: 10px !important;
    background: var(--mt-cart-soft) !important;
    overflow: hidden !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-img {
    width: 100% !important;
    height: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: 100% !important;
    max-height: 100% !important;
    align-self: stretch !important;
    justify-self: stretch !important;
    object-fit: contain !important;
    line-height: 1 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-title {
    width: 100% !important;
    height: 42px !important;
    margin: 12px 0 0 !important;
    color: var(--mt-cart-ink) !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    line-height: 1.45 !important;
    overflow: hidden !important;
    display: -webkit-box !important;
    -webkit-box-orient: vertical !important;
    -webkit-line-clamp: 2 !important;
    flex: 0 0 42px !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-price {
    min-height: 26px !important;
    margin: 8px 0 0 !important;
    color: var(--mt-cart-ink) !important;
    font-size: 18px !important;
    font-weight: 700 !important;
    flex: 0 0 auto !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-order {
    width: 100% !important;
    height: 42px !important;
    display: block !important;
    flex: 0 0 42px !important;
    margin: 10px 0 0 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-order .btn,
  .popup.__cart[data-mt-cart-theme="v1"] .productsSlider-order > a {
    box-sizing: border-box !important;
    width: 100% !important;
    min-height: 42px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 10px !important;
    padding: 0 14px !important;
    background: var(--mt-cart-accent) !important;
    color: var(--mt-cart-ink) !important;
    font-size: 14px !important;
    font-weight: 600 !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .slideCarousel-nav-btn {
    box-sizing: border-box !important;
    width: 44px !important;
    height: 44px !important;
    z-index: 12 !important;
    top: 50% !important;
    display: grid !important;
    place-items: center !important;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 11px !important;
    padding: 0 !important;
    background: var(--mt-cart-accent) !important;
    box-shadow: 0 7px 20px rgba(18, 25, 38, .18) !important;
    transform: translateY(-50%) !important;
    transition: background .18s ease, box-shadow .18s ease, opacity .18s ease !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .slideCarousel-nav-btn.__slideLeft {
    right: auto !important;
    left: 12px !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .slideCarousel-nav-btn.__slideRight {
    right: 12px !important;
    left: auto !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .slideCarousel-nav-btn::before {
    box-sizing: border-box !important;
    width: 11px !important;
    height: 11px !important;
    display: block !important;
    border: solid var(--mt-cart-ink) !important;
    border-width: 0 2px 2px 0 !important;
    background: transparent !important;
    content: "" !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .slideCarousel-nav-btn.__slideLeft::before {
    transform: translateX(2px) rotate(135deg) !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .slideCarousel-nav-btn.__slideRight::before {
    transform: translateX(-2px) rotate(-45deg) !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .slideCarousel-nav-btn:hover {
    background: #ffe23d !important;
    box-shadow: 0 9px 24px rgba(18, 25, 38, .22) !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .slideCarousel-nav-btn:focus-visible {
    outline: 3px solid rgba(31, 31, 31, .28) !important;
    outline-offset: 2px !important;
  }

  .popup.__cart[data-mt-cart-theme="v1"] .slideCarousel-nav-btn.__disabled,
  .popup.__cart[data-mt-cart-theme="v1"] .slideCarousel-nav-btn:disabled {
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
}

@media (max-width: 1023px) {
  #cart-drawer[data-mt-cart-theme="v1"] {
    box-sizing: border-box !important;
    width: min(100vw, 440px) !important;
    min-width: min(100vw, 320px) !important;
    max-width: 100vw !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__block,
  #cart-drawer[data-mt-cart-theme="v1"] .cart__body {
    width: 100% !important;
    max-width: 100% !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__body {
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain !important;
    scrollbar-width: thin !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__container {
    box-sizing: border-box !important;
    width: 100% !important;
    max-width: none !important;
    padding-right: 16px !important;
    padding-left: 16px !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart-item__image {
    width: 64px !important;
    min-width: 64px !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart-item__img {
    width: 64px !important;
    height: 64px !important;
    object-fit: contain !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__order .btn {
    border-radius: 10px !important;
    background: var(--mt-cart-accent) !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods {
    width: 100% !important;
    margin-top: 24px !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods > .heading {
    margin-bottom: 13px !important;
    color: var(--mt-cart-ink) !important;
    font-size: 20px !important;
    line-height: 1.25 !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .carousel {
    box-sizing: border-box !important;
    width: calc(100% + 32px) !important;
    margin-right: -16px !important;
    margin-left: -16px !important;
    padding: 0 16px 12px !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    scroll-snap-type: x proximity !important;
    scrollbar-width: thin !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .carousel__wrapper {
    width: max-content !important;
    min-width: 100% !important;
    display: flex !important;
    gap: 14px !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .carousel__item {
    box-sizing: border-box !important;
    width: var(--mt-cart-mobile-card-width) !important;
    min-width: var(--mt-cart-mobile-card-width) !important;
    max-width: var(--mt-cart-mobile-card-width) !important;
    flex: 0 0 var(--mt-cart-mobile-card-width) !important;
    margin: 0 !important;
    scroll-snap-align: start !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .catalog-card--small {
    box-sizing: border-box !important;
    width: 100% !important;
    min-height: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    padding: 9px !important;
    border: 1px solid var(--mt-cart-line) !important;
    border-radius: 11px !important;
    background: #fff !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .catalog-card__link {
    width: 100% !important;
    display: flex !important;
    flex: 1 1 auto !important;
    flex-direction: column !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .catalog-card__image,
  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .image,
  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .image__box {
    width: 100% !important;
    height: auto !important;
    aspect-ratio: 1 / 1 !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .catalog-card__image {
    border-radius: 8px !important;
    background: var(--mt-cart-soft) !important;
    overflow: hidden !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .image__src {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .catalog-card__title {
    width: 100% !important;
    height: 60px !important;
    margin: 9px 0 0 !important;
    color: var(--mt-cart-ink) !important;
    font-size: 14px !important;
    line-height: 1.4 !important;
    overflow: hidden !important;
    display: -webkit-box !important;
    -webkit-box-orient: vertical !important;
    -webkit-line-clamp: 3 !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .catalog-card__prices {
    min-height: 25px !important;
    margin-top: 7px !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .catalog-card__price {
    color: var(--mt-cart-ink) !important;
    font-size: 17px !important;
    font-weight: 700 !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .catalog-card__order {
    width: 100% !important;
    height: 42px !important;
    margin-top: 9px !important;
  }

  #cart-drawer[data-mt-cart-theme="v1"] .cart__related-goods .catalog-card__order .btn {
    box-sizing: border-box !important;
    width: 100% !important;
    height: 42px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 9px !important;
    background: var(--mt-cart-accent) !important;
    font-size: 14px !important;
  }
}
`;

const themeCss = {
  'balanced-upsell': String.raw`
[data-mt-cart-theme="v1"][data-mt-cart-layout="balanced-upsell"] {
  --mt-cart-desktop-width: 1180px;
  --mt-cart-product-row-height: 100px;
  --mt-cart-card-width: 240px;
  --mt-cart-card-image-height: 270px;
  --mt-cart-mobile-card-width: 166px;
}
`,
  'accessory-showcase': String.raw`
[data-mt-cart-theme="v1"][data-mt-cart-layout="accessory-showcase"] {
  --mt-cart-desktop-width: 1280px;
  --mt-cart-product-row-height: 96px;
  --mt-cart-card-width: 270px;
  --mt-cart-card-image-height: 300px;
  --mt-cart-mobile-card-width: 178px;
}
`,
  'compact-wide': String.raw`
[data-mt-cart-theme="v1"][data-mt-cart-layout="compact-wide"] {
  --mt-cart-desktop-width: 1060px;
  --mt-cart-product-row-height: 92px;
  --mt-cart-card-width: 210px;
  --mt-cart-card-image-height: 240px;
  --mt-cart-mobile-card-width: 154px;
}
`
};

export function cartThemeCss(themeId) {
  return `${baseCss}\n${themeCss[themeId] || themeCss['balanced-upsell']}`;
}

export function cartThemeEmbedScript(themeId, stylesheetUrl = '') {
  const css = cartThemeCss(themeId);
  return `(() => {
  if (window.__mtHoroshopCartThemeV1) return;
  window.__mtHoroshopCartThemeV1 = true;
  const themeId = ${JSON.stringify(themeId)};
  const stylesheetUrl = ${JSON.stringify(stylesheetUrl)};
  const styleId = 'mt-horoshop-cart-theme-v1';
  const enhancedCarousels = new WeakSet();
  const enhancedImages = new WeakSet();
  let scheduledFrame = 0;

  function requestCarouselRefresh() {
    window.setTimeout(() => {
      try { window.dispatchEvent(new Event('resize')); } catch {}
    }, 40);
  }

  function installStyle() {
    const existing = document.getElementById(styleId);
    if (existing) return existing;
    if (stylesheetUrl) {
      const link = document.createElement('link');
      link.id = styleId;
      link.rel = 'stylesheet';
      link.href = stylesheetUrl;
      link.addEventListener('load', requestCarouselRefresh, { once: true });
      (document.head || document.documentElement).appendChild(link);
      return link;
    }
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = ${JSON.stringify(css)};
    (document.head || document.documentElement).appendChild(style);
    return style;
  }

  function upgradeRecommendationImageUrl(value) {
    if (!value) return value;
    return value.replace(
      /(\\/content\\/images\\/\\d+\\/)(\\d+)x(\\d+)(l\\d+[a-z0-9]+\\/)/i,
      (match, prefix, widthValue, heightValue, suffix) => {
        const width = Number(widthValue);
        const height = Number(heightValue);
        const longestSide = Math.max(width, height);
        if (!Number.isFinite(longestSide) || longestSide <= 0 || longestSide >= 360) return match;
        const scale = Math.min(4, Math.ceil(360 / longestSide));
        return prefix + (width * scale) + 'x' + (height * scale) + suffix;
      }
    );
  }

  function enhanceRecommendationImages(root) {
    let changed = false;
    root.querySelectorAll('.productsSlider-img').forEach((image) => {
      if (enhancedImages.has(image)) return;
      enhancedImages.add(image);
      const source = image.getAttribute('src') || '';
      const upgradedSource = upgradeRecommendationImageUrl(source);
      if (upgradedSource !== source) {
        image.setAttribute('src', upgradedSource);
        changed = true;
      }
    });
    return changed;
  }

  function organizeDesktopLayout(root) {
    const cart = root.querySelector('.cart');
    const footer = root.querySelector('.cart-foot');
    if (!cart || !footer || footer.parentElement === cart) return false;
    cart.appendChild(footer);
    return true;
  }

  function markRoot(root, surface) {
    let changed = false;
    if (root.getAttribute('data-mt-cart-theme') !== 'v1') {
      root.setAttribute('data-mt-cart-theme', 'v1');
      changed = true;
    }
    if (root.getAttribute('data-mt-cart-layout') !== themeId) {
      root.setAttribute('data-mt-cart-layout', themeId);
      changed = true;
    }
    if (root.getAttribute('data-mt-cart-surface') !== surface) {
      root.setAttribute('data-mt-cart-surface', surface);
      changed = true;
    }
    if (surface === 'desktop') {
      changed = enhanceRecommendationImages(root) || changed;
      changed = organizeDesktopLayout(root) || changed;
      const overlay = root.closest('.overlay');
      if (overlay) {
        if (overlay.getAttribute('data-mt-cart-overlay') !== 'v1') {
          overlay.setAttribute('data-mt-cart-overlay', 'v1');
          changed = true;
        }
        const open = !root.hidden
          && root.getAttribute('aria-hidden') !== 'true'
          && window.getComputedStyle(root).display !== 'none';
        const openValue = open ? 'true' : 'false';
        if (overlay.getAttribute('data-mt-cart-overlay-open') !== openValue) {
          overlay.setAttribute('data-mt-cart-overlay-open', openValue);
          changed = true;
        }
      }
    }
    const carousel = surface === 'desktop'
      ? root.querySelector('.productsSlider-container')
      : root.querySelector('.cart__related-goods .carousel');
    if (carousel && !enhancedCarousels.has(carousel)) {
      enhancedCarousels.add(carousel);
      changed = true;
    }
    return changed;
  }

  function apply() {
    const desktopRoots = [...document.querySelectorAll('.popup.__cart, #cart.popup')];
    const mobileRoots = [...document.querySelectorAll('#cart-drawer.cart, #cart-drawer')];
    const roots = [...new Set([...desktopRoots, ...mobileRoots])];
    if (!roots.length) {
      document.querySelectorAll('[data-mt-cart-overlay="v1"]').forEach((overlay) => {
        overlay.setAttribute('data-mt-cart-overlay-open', 'false');
      });
      return false;
    }
    installStyle();
    let changed = false;
    desktopRoots.forEach((root) => { changed = markRoot(root, 'desktop') || changed; });
    mobileRoots.forEach((root) => { changed = markRoot(root, 'mobile') || changed; });
    document.querySelectorAll('[data-mt-cart-overlay="v1"]').forEach((overlay) => {
      if (!overlay.querySelector('.popup.__cart, #cart.popup')
        && overlay.getAttribute('data-mt-cart-overlay-open') !== 'false') {
        overlay.setAttribute('data-mt-cart-overlay-open', 'false');
        changed = true;
      }
    });
    if (changed) requestCarouselRefresh();
    return true;
  }

  function scheduleApply() {
    if (scheduledFrame) return;
    const schedule = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
    scheduledFrame = schedule(() => {
      scheduledFrame = 0;
      apply();
    });
  }

  apply();
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => mutation.type === 'childList'
      || (mutation.type === 'attributes'
        && mutation.target instanceof Element
        && mutation.target.matches('.popup.__cart, #cart.popup, .overlay, #cart-drawer')));
    if (relevant) scheduleApply();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']
  });
})();`;
}
