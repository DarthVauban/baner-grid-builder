export const campaignStyles = `
.mt-campaign.mt-product-selection {
  --mt-selection-text: #000;
  --mt-selection-accent: #ffe101;
  container-type: inline-size;
  font-family: inherit !important;
}

.mt-campaign__body {
  display: grid;
  grid-template-columns: clamp(200px,17%,249px) minmax(0,1fr);
  gap: 22px;
  align-items: start;
}

.mt-campaign__sidebar {
  position: sticky;
  top: 12px;
  display: flex;
  flex-direction: column;
  min-height: min(607px,calc(100vh - 24px));
  max-height: calc(100vh - 24px);
  padding: 18px 13px 16px;
  overflow: hidden;
  border-radius: 11px;
  color: white;
  background: radial-gradient(ellipse 95% 29% at -14% 109%,rgba(255,225,1,.53),transparent 94%),
    radial-gradient(ellipse 105% 28% at 10% 106%,rgba(255,225,1,.19),transparent 84%),#000;
}

.mt-campaign__mast {
  position: relative;
  margin: 0 5px 10px;
  padding: 0 30px 15px 0;
  border-bottom: 1px solid #393939;
}

.mt-campaign .mt-campaign__mast h2 {
  margin: 0;
  color: #fff;
  font-family: inherit;
  font-weight: 800;
  font-size: clamp(24px,2.2vw,31px);
  line-height: 1.04;
  letter-spacing: -.035em;
  overflow-wrap: anywhere;
}

.mt-campaign__mast h2 span {
  display: block;
  color: #ffe101;
}

.mt-campaign__mast::after {
  content: '';
  position: absolute;
  top: 3px;
  right: 3px;
  width: 21px;
  height: 15px;
  transform: skewX(-29deg);
  background: repeating-linear-gradient(90deg,#ffe101 0 4px,transparent 4px 7px);
}

.mt-campaign__catlabel,.mt-campaign__mobile {
  font-size: 12px;
  font-weight: 600;
  color: #bcbcbc;
}

.mt-campaign__catlabel {
  margin: 3px 8px 6px;
}

.mt-campaign__nav {
  display: grid;
  gap: 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.mt-campaign__nav a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  min-height: 32px;
  border: 0;
  border-radius: 5px;
  color: white;
  text-decoration: none;
  font-size: 14px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.mt-campaign__nav a:hover {
  background: #262626;
}

.mt-campaign__nav a[aria-current=true] {
  background: #ffe101;
  color: #000;
  font-weight: 700;
  clip-path: polygon(0 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%);
}

.mt-campaign__nav small {
  color: #bcbcbc;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.mt-campaign__nav [aria-current=true] small {
  color: inherit;
}

.mt-campaign__mobile {
  display: none;
}

.mt-campaign__catalog {
  min-width: 0;
}

.mt-campaign__top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-height: 40px;
  margin: 0 0 9px;
}

.mt-campaign .mt-campaign__title {
  margin: 0;
  max-width: 100%;
  font: inherit;
  font-size: clamp(21px,2vw,27px);
  line-height: 1.15;
  letter-spacing: -.035em;
  overflow-wrap: anywhere;
  color: #000;
}

.mt-campaign__count {
  padding: 2px 8px;
  border: 1px solid #dadbd9;
  border-radius: 20px;
  font: 600 12px/1.45 Arial,sans-serif;
  font-variant-numeric: tabular-nums;
}

.mt-campaign__search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  width: 200px;
  max-width: 100%;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid #d6d6d3;
  border-radius: 5px;
  color: #5b5b58;
  background: white;
}

.mt-campaign__search::before {
  content: '';
  width: 15px;
  height: 15px;
  flex: none;
  background: center/contain no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%235c5c59' stroke-width='1.6'%3E%3Ccircle cx='8' cy='8' r='5.5'/%3E%3Cpath d='m12 12 5 5'/%3E%3C/svg%3E");
}

.mt-campaign__search input {
  width: 100%;
  min-width: 0;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  padding: 5px 0 !important;
  outline: 0;
  font: inherit;
  font-size: 13px;
  color: #111;
}

.mt-campaign__search:focus-within {
  outline: 2px solid #777;
}

.mt-campaign__brands {
  display: flex;
  max-height: 109px;
  overflow-y: auto;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 12px;
  padding: 0 0 10px;
  border-bottom: 1px solid #dededc;
}

.mt-campaign__chip,.mt-campaign__more {
  font-family: inherit;
  cursor: pointer;
  color: #222;
  background: #fff;
  border: 1px solid #d4d4d1;
}

.mt-campaign__chip {
  min-height: 29px;
  max-width: 100%;
  padding: 4px 13px;
  border-radius: 99px;
  font-size: 13px;
  line-height: 1.2;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.mt-campaign__chip:hover {
  border-color: #777;
}

.mt-campaign__chip[aria-pressed=true] {
  color: white;
  background: #111;
  border-color: #111;
}

.mt-campaign__chip[aria-pressed=true]::before {
  content: '✓' / '';
  color: #ffe101;
  margin-right: 6px;
}

.mt-campaign :is(button,a,select):focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -2px;
}

.mt-campaign .mt-product-selection__grid {
  grid-template-columns: repeat(5,minmax(0,1fr)) !important;
  gap: 14px 16px !important;
}

.mt-campaign .mt-product-selection__card {
  display: flex !important;
  flex-direction: column;
  gap: 0 !important;
  padding: 0 0 9px !important;
  border: 0 !important;
  border-bottom: 1px solid #dededc !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  transform: none !important;
  will-change: auto !important;
}

.mt-campaign .mt-product-selection__media {
  aspect-ratio: 1.57 !important;
  padding: 8px !important;
  border-radius: 7px !important;
  background: #f6f6f5 !important;
}

.mt-campaign .mt-product-selection__image {
  mix-blend-mode: multiply;
}

.mt-campaign .mt-product-selection__title {
  margin: 8px 2px 0 !important;
  min-height: 0 !important;
  font-size: 15px !important;
  line-height: 1.28 !important;
  color: #111 !important;
}

.mt-campaign .mt-product-selection__title:hover {
  text-decoration: underline !important;
}

.mt-campaign__meta {
  margin: 3px 2px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #666;
  font-size: 12px;
  line-height: 1.45;
}

.mt-campaign__foot {
  display: flex;
  min-height: 38px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 5px 8px;
  margin-top: auto;
  padding: 7px 2px 0;
}

.mt-campaign .mt-product-selection__price {
  display: grid !important;
  min-height: 0 !important;
  gap: 2px !important;
}

.mt-campaign .mt-product-selection__buy {
  width: auto !important;
  max-width: 100%;
  min-height: 38px !important;
  padding: 7px 13px !important;
  border: 0 !important;
  border-radius: 6px !important;
  font-size: 14px !important;
  gap: 6px;
}

.mt-campaign .mt-product-selection__buy:not(:disabled)::before {
  content: '';
  width: 15px;
  height: 15px;
  flex: none;
  background: center/contain no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%23000' stroke-width='1.6' stroke-linejoin='round' viewBox='0 0 20 20'%3E%3Cpath d='M3 7h14l1 11H2L3 7Zm4 1V5a3 3 0 0 1 6 0v3m-3 2v5m-2.5-2.5h5'/%3E%3C/svg%3E");
}

.mt-campaign .mt-product-selection__buy:hover:not(:disabled) {
  background: #ffea50 !important;
}

.mt-campaign .mt-product-selection__buy.is-unavailable {
  width: auto !important;
  min-height: 0 !important;
  background: transparent !important;
  padding: 4px 0 !important;
  color: #666 !important;
  font-size: 12px !important;
  font-weight: 400 !important;
}

.mt-campaign__more {
  display: block;
  margin: 18px auto 0;
  padding: 9px 20px;
  border-radius: 6px;
  font-size: 14px;
}

.mt-campaign__status {
  margin: 12px 0;
  font-size: 14px;
  color: #575757;
}

.mt-campaign [hidden],.mt-campaign__status:empty {
  display: none !important;
}

@container (max-width:1250px) {
  .mt-campaign .mt-product-selection__grid {
    grid-template-columns: repeat(4,minmax(0,1fr)) !important;
  }
}

@container (max-width:1000px) {
  .mt-campaign .mt-product-selection__grid {
    grid-template-columns: repeat(3,minmax(0,1fr)) !important;
  }
}

@container (max-width:760px) {
  .mt-campaign__body {
    grid-template-columns: minmax(0,1fr);
    gap: 12px;
  }
  .mt-campaign__sidebar {
    position: static;
    min-height: 0;
    max-height: none;
    padding: 12px 14px;
    background-color: #000;
  }
  .mt-campaign__mast {
    margin: 0 0 9px;
    padding-bottom: 9px;
  }
  .mt-campaign .mt-campaign__mast h2 {
    font-size: 22px;
  }
  .mt-campaign__mast h2 span {
    display: inline;
  }
  .mt-campaign__nav,.mt-campaign__catlabel {
    display: none;
  }
  .mt-campaign__mobile {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .mt-campaign__mobile select {
    flex: 1;
    min-width: 0;
    max-width: 100%;
    min-height: 40px;
    padding: 5px 8px;
    border: 1px solid #555;
    border-radius: 5px;
    background: #161616;
    color: white;
    font: inherit;
  }
  .mt-campaign .mt-product-selection__grid {
    grid-template-columns: repeat(2,minmax(0,1fr)) !important;
    gap: 13px 10px !important;
  }
  .mt-campaign__search {
    width: 155px;
  }
  .mt-campaign__brands {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-top: 2px;
    scrollbar-width: thin;
  }
  .mt-campaign__chip {
    flex: none;
    min-height: 34px;
  }
  .mt-campaign .mt-product-selection__title {
    font-size: 14px !important;
  }
  .mt-campaign .mt-product-selection__buy {
    min-height: 42px !important;
    padding: 7px 10px !important;
  }
}
`;
