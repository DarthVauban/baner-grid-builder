export type PromoVariant='capsule'|'coupon'|'card';
export type PromoStyleValue=string|number|boolean;
export type PromoContent={value:string;label:string;promo?:{version:1;variant:PromoVariant;base:Record<string,PromoStyleValue>;mobile?:Record<string,PromoStyleValue>; laptop?:Record<string,PromoStyleValue>; tablet?:Record<string,PromoStyleValue>; mobileLandscape?:Record<string,PromoStyleValue>}};
