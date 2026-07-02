(function () {
  'use strict';

  const DAY_MS = 86400000;
  const MINUTE_MS = 60000;
  const PRODUCTS_CODE_BASE64 = 'PCEtLQ0KICDQktGB0YLQsNCy0YLQtSDQstC10YHRjCDRhtC10Lkg0LHQu9C+0Log0YMg0YDQtdC20LjQvNGWICLQlNC20LXRgNC10LvQviIg0LIg0L/QvtGC0YDRltCx0L3QtSDQvNGW0YHRhtC1INGC0LXQutGB0YLRgy4NCg0KICDQqdC+0LEg0L/QvtC60LDQt9Cw0YLQuCDQsdCw0L3QtdGALCDQstGB0YLQsNCy0YLQtSDQsNC00YDQtdGB0YMg0LfQvtCx0YDQsNC20LXQvdC90Y8gMTIwMHg0MDAg0YMgZGF0YS1pbWFnZS11cmwuDQogINCX0LAg0L/QvtGC0YDQtdCx0Lgg0LLRgdGC0LDQstGC0LUg0LDQtNGA0LXRgdGDINC/0LXRgNC10YXQvtC00YMg0LIgZGF0YS1saW5rLXVybC4NCiAg0K/QutGJ0L4gZGF0YS1pbWFnZS11cmwg0L/QvtGA0L7QttC90ZbQuSwg0LHQsNC90LXRgCDQvdC1INCy0ZbQtNC+0LHRgNCw0LbQsNGU0YLRjNGB0Y8g0ZYg0L3QtSDQt9Cw0LnQvNCw0ZQg0LzRltGB0YbRjy4NCi0tPg0KPGRpdiBjbGFzcz0iaHMtcGFnZS1iYW5uZXIiIGRhdGEtYWx0PSIiIGRhdGEtaW1hZ2UtdXJsPSIiIGRhdGEtbGluay11cmw9IiIgaGlkZGVuPSIiIGlkPSJocy1wYWdlLWJhbm5lciI+Jm5ic3A7PC9kaXY+DQoNCjxzZWN0aW9uIGNsYXNzPSJocy1wcm9kdWN0cyIgaGlkZGVuPSIiIGlkPSJocy1pbmxpbmUtcHJvZHVjdHMiPg0KPGRpdiBhcmlhLWxpdmU9InBvbGl0ZSIgY2xhc3M9ImhzLXByb2R1Y3RzX19tb3VudCI+Jm5ic3A7PC9kaXY+DQo8L3NlY3Rpb24+DQo8c3R5bGUgdHlwZT0idGV4dC9jc3MiPi5ocy1wYWdlLWJhbm5lcltoaWRkZW5dLA0KICAuaHMtcHJvZHVjdHNbaGlkZGVuXSB7DQogICAgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50Ow0KICB9DQoNCiAgLmhzLXBhZ2UtYmFubmVyIHsNCiAgICB3aWR0aDogMTAwJTsNCiAgICBtYXgtd2lkdGg6IDEyMDBweDsNCiAgICBtYXJnaW46IDAgYXV0byAzMnB4Ow0KICB9DQoNCiAgLmhzLXBhZ2UtYmFubmVyX19saW5rIHsNCiAgICBkaXNwbGF5OiBibG9jazsNCiAgICBvdmVyZmxvdzogaGlkZGVuOw0KICAgIGJvcmRlci1yYWRpdXM6IDE2cHg7DQogICAgdGV4dC1kZWNvcmF0aW9uOiBub25lOw0KICB9DQoNCiAgLmhzLXBhZ2UtYmFubmVyX19pbWFnZSB7DQogICAgZGlzcGxheTogYmxvY2s7DQogICAgd2lkdGg6IDEwMCUgIWltcG9ydGFudDsNCiAgICBoZWlnaHQ6IGF1dG8gIWltcG9ydGFudDsNCiAgICBhc3BlY3QtcmF0aW86IDMgLyAxOw0KICAgIG9iamVjdC1maXQ6IGNvdmVyOw0KICB9DQoNCiAgLmhzLXByb2R1Y3RzIHsNCiAgICBtYXJnaW46IDQwcHggMDsNCiAgICBmb250LWZhbWlseTogaW5oZXJpdDsNCiAgfQ0KDQogIC5ocy1wcm9kdWN0c19fbmF0aXZlIHsNCiAgICBtYXJnaW46IDAgIWltcG9ydGFudDsNCiAgICBwYWRkaW5nOiAwICFpbXBvcnRhbnQ7DQogICAgb3ZlcmZsb3c6IHZpc2libGUgIWltcG9ydGFudDsNCiAgfQ0KDQogIC5ocy1wcm9kdWN0c19fbmF0aXZlID4gLnByb2R1Y3QtaGVhZGluZyB7DQogICAgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50Ow0KICB9DQoNCiAgLmhzLXByb2R1Y3RzX19uYXRpdmUgLnByb2R1Y3RzU2xpZGVyLA0KICAuaHMtcHJvZHVjdHNfX25hdGl2ZSAucHJvZHVjdHNTbGlkZXItY29udGFpbmVyLA0KICAuaHMtcHJvZHVjdHNfX25hdGl2ZSAucHJvZHVjdHNTbGlkZXItd3JhcHBlciB7DQogICAgcG9zaXRpb246IHN0YXRpYyAhaW1wb3J0YW50Ow0KICAgIHdpZHRoOiBhdXRvICFpbXBvcnRhbnQ7DQogICAgaGVpZ2h0OiBhdXRvICFpbXBvcnRhbnQ7DQogICAgbWluLWhlaWdodDogMCAhaW1wb3J0YW50Ow0KICAgIG1hcmdpbjogMCAhaW1wb3J0YW50Ow0KICAgIG92ZXJmbG93OiB2aXNpYmxlICFpbXBvcnRhbnQ7DQogICAgdHJhbnNmb3JtOiBub25lICFpbXBvcnRhbnQ7DQogIH0NCg0KICAuaHMtcHJvZHVjdHNfX25hdGl2ZSAucHJvZHVjdHNTbGlkZXItd3JhcHBlciB7DQogICAgZGlzcGxheTogZ3JpZCAhaW1wb3J0YW50Ow0KICAgIGdyaWQtdGVtcGxhdGUtY29sdW1uczogcmVwZWF0KDQsIG1pbm1heCgwLCAxZnIpKTsNCiAgICBnYXA6IDIwcHg7DQogICAgYWxpZ24taXRlbXM6IHN0cmV0Y2g7DQogICAgcGFkZGluZzogMCAhaW1wb3J0YW50Ow0KICAgIGxpc3Qtc3R5bGU6IG5vbmUgIWltcG9ydGFudDsNCiAgfQ0KDQogIC5ocy1wcm9kdWN0c19fbmF0aXZlIC5wcm9kdWN0c1NsaWRlci1pIHsNCiAgICBwb3NpdGlvbjogcmVsYXRpdmU7DQogICAgZGlzcGxheTogZmxleCAhaW1wb3J0YW50Ow0KICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47DQogICAgd2lkdGg6IGF1dG8gIWltcG9ydGFudDsNCiAgICBtaW4td2lkdGg6IDA7DQogICAgaGVpZ2h0OiBhdXRvICFpbXBvcnRhbnQ7DQogICAgbWFyZ2luOiAwICFpbXBvcnRhbnQ7DQogICAgcGFkZGluZzogMThweCAhaW1wb3J0YW50Ow0KICAgIG92ZXJmbG93OiB2aXNpYmxlICFpbXBvcnRhbnQ7DQogICAgYm94LXNpemluZzogYm9yZGVyLWJveDsNCiAgICBiYWNrZ3JvdW5kOiAjZmZmOw0KICAgIGJvcmRlcjogMXB4IHNvbGlkICNlN2U5ZWU7DQogICAgYm9yZGVyLXJhZGl1czogMTZweDsNCiAgICBib3gtc2hhZG93OiAwIDZweCAyNHB4IHJnYmEoMjAsIDMwLCA1NSwgMC4wNyk7DQogICAgdHJhbnNmb3JtOiBub25lICFpbXBvcnRhbnQ7DQogICAgdHJhbnNpdGlvbjoNCiAgICAgIHRyYW5zZm9ybSAwLjJzIGVhc2UsDQogICAgICBib3gtc2hhZG93IDAuMnMgZWFzZSwNCiAgICAgIGJvcmRlci1jb2xvciAwLjJzIGVhc2U7DQogIH0NCg0KICAuaHMtcHJvZHVjdHNfX25hdGl2ZSAucHJvZHVjdHNTbGlkZXItaTo6YmVmb3JlLA0KICAuaHMtcHJvZHVjdHNfX25hdGl2ZSAucHJvZHVjdHNTbGlkZXItaTo6YWZ0ZXIgew0KICAgIGRpc3BsYXk6IG5vbmUgIWltcG9ydGFudDsNCiAgICBjb250ZW50OiBub25lICFpbXBvcnRhbnQ7DQogIH0NCg0KICAuaHMtcHJvZHVjdHNfX25hdGl2ZSAucHJvZHVjdHNTbGlkZXItaTpob3ZlciB7DQogICAgei1pbmRleDogNTsNCiAgICBib3JkZXItY29sb3I6ICNkNmRhZTM7DQogICAgYm94LXNoYWRvdzogMCAxMnB4IDMycHggcmdiYSgyMCwgMzAsIDU1LCAwLjEzKTsNCiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTRweCkgIWltcG9ydGFudDsNCiAgfQ0KDQogIC5ocy1wcm9kdWN0c19fbmF0aXZlIC5wcm9kdWN0c1NsaWRlci1pID4gYSB7DQogICAgY29sb3I6IGluaGVyaXQ7DQogICAgdGV4dC1kZWNvcmF0aW9uOiBub25lOw0KICB9DQoNCiAgLmhzLXByb2R1Y3RzX19uYXRpdmUgLnByb2R1Y3RzU2xpZGVyLWltYWdlIHsNCiAgICBwb3NpdGlvbjogcmVsYXRpdmUgIWltcG9ydGFudDsNCiAgICBkaXNwbGF5OiBmbGV4Ow0KICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7DQogICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7DQogICAgd2lkdGg6IDEwMCU7DQogICAgaGVpZ2h0OiBhdXRvICFpbXBvcnRhbnQ7DQogICAgbWluLWhlaWdodDogMCAhaW1wb3J0YW50Ow0KICAgIGFzcGVjdC1yYXRpbzogMSAvIDE7DQogICAgbWFyZ2luLWJvdHRvbTogMTRweDsNCiAgICBwYWRkaW5nOiA4cHg7DQogICAgb3ZlcmZsb3c6IGhpZGRlbjsNCiAgICBib3gtc2l6aW5nOiBib3JkZXItYm94Ow0KICAgIGJhY2tncm91bmQ6ICNmZmY7DQogICAgYm9yZGVyLXJhZGl1czogMTJweDsNCiAgfQ0KDQogIC5ocy1wcm9kdWN0c19fbmF0aXZlIC5wcm9kdWN0c1NsaWRlci1pbWFnZSBpbWcsDQogIC5ocy1wcm9kdWN0c19fbmF0aXZlIC5wcm9kdWN0c1NsaWRlci1pbWcgew0KICAgIHBvc2l0aW9uOiBzdGF0aWMgIWltcG9ydGFudDsNCiAgICBpbnNldDogYXV0byAhaW1wb3J0YW50Ow0KICAgIGRpc3BsYXk6IGJsb2NrICFpbXBvcnRhbnQ7DQogICAgd2lkdGg6IGF1dG8gIWltcG9ydGFudDsNCiAgICBoZWlnaHQ6IGF1dG8gIWltcG9ydGFudDsNCiAgICBtYXgtd2lkdGg6IDEwMCUgIWltcG9ydGFudDsNCiAgICBtYXgtaGVpZ2h0OiAxMDAlICFpbXBvcnRhbnQ7DQogICAgbWFyZ2luOiBhdXRvICFpbXBvcnRhbnQ7DQogICAgb2JqZWN0LWZpdDogY29udGFpbiAhaW1wb3J0YW50Ow0KICAgIG9iamVjdC1wb3NpdGlvbjogY2VudGVyIGNlbnRlciAhaW1wb3J0YW50Ow0KICAgIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjI1cyBlYXNlOw0KICB9DQoNCiAgLmhzLXByb2R1Y3RzX19uYXRpdmUgLnByb2R1Y3RzU2xpZGVyLWk6aG92ZXIgLnByb2R1Y3RzU2xpZGVyLWltYWdlIGltZyB7DQogICAgdHJhbnNmb3JtOiBzY2FsZSgxLjA0KTsNCiAgfQ0KDQogIC5ocy1wcm9kdWN0c19fbmF0aXZlIC5wcm9kdWN0c1NsaWRlci10aXRsZSB7DQogICAgbWluLWhlaWdodDogMi44ZW07DQogICAgbWFyZ2luOiAwIDAgMTJweDsNCiAgICBvdmVyZmxvdzogaGlkZGVuOw0KICAgIGNvbG9yOiAjMWYyOTM3Ow0KICAgIGZvbnQtc2l6ZTogMTVweDsNCiAgICBmb250LXdlaWdodDogNjAwOw0KICAgIGxpbmUtaGVpZ2h0OiAxLjQ7DQogIH0NCg0KICAuaHMtcHJvZHVjdHNfX25hdGl2ZSAucHJvZHVjdHNTbGlkZXItcHJpY2Ugew0KICAgIG1hcmdpbi10b3A6IGF1dG87DQogICAgY29sb3I6ICMxMTE4Mjc7DQogICAgZm9udC1zaXplOiAxOXB4Ow0KICAgIGZvbnQtd2VpZ2h0OiA3MDA7DQogICAgbGluZS1oZWlnaHQ6IDEuMzsNCiAgfQ0KDQogIC5ocy1wcm9kdWN0c19fbmF0aXZlIC5wcm9kdWN0c1NsaWRlci1vcmRlciB7DQogICAgbWFyZ2luLXRvcDogMTRweDsNCiAgfQ0KDQogIC5ocy1wcm9kdWN0c19fbmF0aXZlIC5wcm9kdWN0c1NsaWRlci1vcmRlciAuYnRuIHsNCiAgICBkaXNwbGF5OiBmbGV4ICFpbXBvcnRhbnQ7DQogICAgYWxpZ24taXRlbXM6IGNlbnRlcjsNCiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsNCiAgICB3aWR0aDogMTAwJSAhaW1wb3J0YW50Ow0KICAgIG1pbi1oZWlnaHQ6IDQ0cHg7DQogICAgYm94LXNpemluZzogYm9yZGVyLWJveDsNCiAgICBib3JkZXItcmFkaXVzOiAxMHB4Ow0KICB9DQoNCiAgLmhzLXByb2R1Y3RzX19uYXRpdmUgLnN3aXBlci1idXR0b24tcHJldiwNCiAgLmhzLXByb2R1Y3RzX19uYXRpdmUgLnN3aXBlci1idXR0b24tbmV4dCwNCiAgLmhzLXByb2R1Y3RzX19uYXRpdmUgLnByb2R1Y3RzU2xpZGVyLWFycm93LA0KICAuaHMtcHJvZHVjdHNfX25hdGl2ZSAucHJvZHVjdHNTbGlkZXItcGFnaW5hdGlvbiwNCiAgLmhzLXByb2R1Y3RzX19uYXRpdmUgLnN3aXBlci1wYWdpbmF0aW9uLA0KICAuaHMtcHJvZHVjdHNfX25hdGl2ZSAuc3dpcGVyLXNsaWRlLWR1cGxpY2F0ZSB7DQogICAgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50Ow0KICB9DQoNCiAgQG1lZGlhIChtYXgtd2lkdGg6IDk4MHB4KSB7DQogICAgLmhzLXByb2R1Y3RzX19uYXRpdmUgLnByb2R1Y3RzU2xpZGVyLXdyYXBwZXIgew0KICAgICAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiByZXBlYXQoMywgbWlubWF4KDAsIDFmcikpOw0KICAgIH0NCiAgfQ0KDQogIEBtZWRpYSAobWF4LXdpZHRoOiA3MjBweCkgew0KICAgIC5ocy1wYWdlLWJhbm5lciB7DQogICAgICBtYXJnaW4tYm90dG9tOiAyNHB4Ow0KICAgIH0NCg0KICAgIC5ocy1wYWdlLWJhbm5lcl9fbGluayB7DQogICAgICBib3JkZXItcmFkaXVzOiAxMnB4Ow0KICAgIH0NCg0KICAgIC5ocy1wcm9kdWN0cyB7DQogICAgICBtYXJnaW46IDMwcHggMDsNCiAgICB9DQoNCiAgICAuaHMtcHJvZHVjdHNfX25hdGl2ZSAucHJvZHVjdHNTbGlkZXItd3JhcHBlciB7DQogICAgICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IHJlcGVhdCgyLCBtaW5tYXgoMCwgMWZyKSk7DQogICAgICBnYXA6IDE0cHg7DQogICAgfQ0KDQogICAgLmhzLXByb2R1Y3RzX19uYXRpdmUgLnByb2R1Y3RzU2xpZGVyLWkgew0KICAgICAgcGFkZGluZzogMTRweCAhaW1wb3J0YW50Ow0KICAgIH0NCiAgfQ0KDQogIEBtZWRpYSAobWF4LXdpZHRoOiA0NDBweCkgew0KICAgIC5ocy1wcm9kdWN0c19fbmF0aXZlIC5wcm9kdWN0c1NsaWRlci13cmFwcGVyIHsNCiAgICAgIGdyaWQtdGVtcGxhdGUtY29sdW1uczogMWZyOw0KICAgIH0NCiAgfQ0KPC9zdHlsZT4NCjxzY3JpcHQ+DQogIChmdW5jdGlvbiAoKSB7DQogICAgInVzZSBzdHJpY3QiOw0KDQogICAgdmFyIHJvb3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgiaHMtaW5saW5lLXByb2R1Y3RzIik7DQoNCiAgICBpZiAoIXJvb3QgfHwgcm9vdC5nZXRBdHRyaWJ1dGUoImRhdGEtaW5pdGlhbGl6ZWQiKSA9PT0gInRydWUiKSB7DQogICAgICByZXR1cm47DQogICAgfQ0KDQogICAgdmFyIGJhbm5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCJocy1wYWdlLWJhbm5lciIpOw0KICAgIHZhciBtb3VudCA9IHJvb3QucXVlcnlTZWxlY3RvcigiLmhzLXByb2R1Y3RzX19tb3VudCIpOw0KICAgIHZhciBvYnNlcnZlciA9IG51bGw7DQoNCiAgICBmdW5jdGlvbiBtb3VudEJhbm5lcigpIHsNCiAgICAgIGlmICghYmFubmVyKSB7DQogICAgICAgIHJldHVybjsNCiAgICAgIH0NCg0KICAgICAgdmFyIGltYWdlVXJsID0gKGJhbm5lci5nZXRBdHRyaWJ1dGUoImRhdGEtaW1hZ2UtdXJsIikgfHwgIiIpLnRyaW0oKTsNCg0KICAgICAgaWYgKCFpbWFnZVVybCkgew0KICAgICAgICBiYW5uZXIucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChiYW5uZXIpOw0KICAgICAgICByZXR1cm47DQogICAgICB9DQoNCiAgICAgIHZhciBsaW5rID0gYmFubmVyLnF1ZXJ5U2VsZWN0b3IoIi5ocy1wYWdlLWJhbm5lcl9fbGluayIpOw0KICAgICAgdmFyIGxpbmtVcmwgPSAoYmFubmVyLmdldEF0dHJpYnV0ZSgiZGF0YS1saW5rLXVybCIpIHx8ICIiKS50cmltKCk7DQogICAgICB2YXIgaW1hZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCJpbWciKTsNCiAgICAgIHZhciBjb250ZW50UGFyZW50ID0gcm9vdC5wYXJlbnROb2RlOw0KDQogICAgICBpZiAoIWxpbmspIHsNCiAgICAgICAgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoImEiKTsNCiAgICAgICAgbGluay5jbGFzc05hbWUgPSAiaHMtcGFnZS1iYW5uZXJfX2xpbmsiOw0KICAgICAgICBiYW5uZXIuYXBwZW5kQ2hpbGQobGluayk7DQogICAgICB9DQoNCiAgICAgIGltYWdlLmNsYXNzTmFtZSA9ICJocy1wYWdlLWJhbm5lcl9faW1hZ2UiOw0KICAgICAgaW1hZ2Uuc3JjID0gaW1hZ2VVcmw7DQogICAgICBpbWFnZS5hbHQgPSBiYW5uZXIuZ2V0QXR0cmlidXRlKCJkYXRhLWFsdCIpIHx8ICIiOw0KICAgICAgaW1hZ2Uud2lkdGggPSAxMjAwOw0KICAgICAgaW1hZ2UuaGVpZ2h0ID0gNDAwOw0KICAgICAgaW1hZ2UubG9hZGluZyA9ICJlYWdlciI7DQogICAgICBpbWFnZS5mZXRjaFByaW9yaXR5ID0gImhpZ2giOw0KDQogICAgICBpZiAobGlua1VybCkgew0KICAgICAgICBsaW5rLmhyZWYgPSBsaW5rVXJsOw0KICAgICAgfSBlbHNlIHsNCiAgICAgICAgbGluay5yZW1vdmVBdHRyaWJ1dGUoImhyZWYiKTsNCiAgICAgIH0NCg0KICAgICAgbGluay5hcHBlbmRDaGlsZChpbWFnZSk7DQoNCiAgICAgIGlmIChjb250ZW50UGFyZW50ICYmIGNvbnRlbnRQYXJlbnQuZmlyc3RDaGlsZCAhPT0gYmFubmVyKSB7DQogICAgICAgIGNvbnRlbnRQYXJlbnQuaW5zZXJ0QmVmb3JlKGJhbm5lciwgY29udGVudFBhcmVudC5maXJzdENoaWxkKTsNCiAgICAgIH0NCg0KICAgICAgYmFubmVyLmhpZGRlbiA9IGZhbHNlOw0KICAgIH0NCg0KICAgIGZ1bmN0aW9uIGZpbmRTb3VyY2UoKSB7DQogICAgICB2YXIgY2FuZGlkYXRlcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoDQogICAgICAgICIuYXJ0aWNsZV9fYXNzb2NpYXRlZC1wcm9kdWN0cywgIiArDQogICAgICAgICIucGFnZV9fYXNzb2NpYXRlZC1wcm9kdWN0cywgIiArDQogICAgICAgICIudGV4dFBhZ2VfX2Fzc29jaWF0ZWQtcHJvZHVjdHMsICIgKw0KICAgICAgICAiW2NsYXNzKj0nYXNzb2NpYXRlZC1wcm9kdWN0cyddIg0KICAgICAgKTsNCg0KICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjYW5kaWRhdGVzLmxlbmd0aDsgaSArPSAxKSB7DQogICAgICAgIGlmICgNCiAgICAgICAgICAhcm9vdC5jb250YWlucyhjYW5kaWRhdGVzW2ldKSAmJg0KICAgICAgICAgIGNhbmRpZGF0ZXNbaV0ucXVlcnlTZWxlY3RvcigiLnByb2R1Y3RzU2xpZGVyLWkiKQ0KICAgICAgICApIHsNCiAgICAgICAgICByZXR1cm4gY2FuZGlkYXRlc1tpXTsNCiAgICAgICAgfQ0KICAgICAgfQ0KDQogICAgICByZXR1cm4gbnVsbDsNCiAgICB9DQoNCiAgICBmdW5jdGlvbiBtb3VudFByb2R1Y3RzKCkgew0KICAgICAgdmFyIHNvdXJjZSA9IGZpbmRTb3VyY2UoKTsNCg0KICAgICAgaWYgKCFzb3VyY2UpIHsNCiAgICAgICAgcmV0dXJuIGZhbHNlOw0KICAgICAgfQ0KDQogICAgICB2YXIgY2FyZHMgPSBzb3VyY2UucXVlcnlTZWxlY3RvckFsbCgiLnByb2R1Y3RzU2xpZGVyLWkiKTsNCg0KICAgICAgaWYgKCFjYXJkcy5sZW5ndGgpIHsNCiAgICAgICAgcmV0dXJuIGZhbHNlOw0KICAgICAgfQ0KDQogICAgICBBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKA0KICAgICAgICBzb3VyY2UucXVlcnlTZWxlY3RvckFsbCgiLnN3aXBlci1zbGlkZS1kdXBsaWNhdGUiKSwNCiAgICAgICAgZnVuY3Rpb24gKGR1cGxpY2F0ZSkgew0KICAgICAgICAgIGR1cGxpY2F0ZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGR1cGxpY2F0ZSk7DQogICAgICAgIH0NCiAgICAgICk7DQoNCiAgICAgIHNvdXJjZS5jbGFzc0xpc3QuYWRkKCJocy1wcm9kdWN0c19fbmF0aXZlIik7DQogICAgICBtb3VudC5hcHBlbmRDaGlsZChzb3VyY2UpOw0KDQogICAgICBBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKGNhcmRzLCBmdW5jdGlvbiAoY2FyZCkgew0KICAgICAgICBjYXJkLmNsYXNzTGlzdC5yZW1vdmUoDQogICAgICAgICAgInN3aXBlci1zbGlkZS1hY3RpdmUiLA0KICAgICAgICAgICJzd2lwZXItc2xpZGUtcHJldiIsDQogICAgICAgICAgInN3aXBlci1zbGlkZS1uZXh0IiwNCiAgICAgICAgICAic3dpcGVyLXNsaWRlLXZpc2libGUiDQogICAgICAgICk7DQogICAgICB9KTsNCg0KICAgICAgcm9vdC5oaWRkZW4gPSBmYWxzZTsNCiAgICAgIHJvb3Quc2V0QXR0cmlidXRlKCJkYXRhLWluaXRpYWxpemVkIiwgInRydWUiKTsNCg0KICAgICAgaWYgKG9ic2VydmVyKSB7DQogICAgICAgIG9ic2VydmVyLmRpc2Nvbm5lY3QoKTsNCiAgICAgIH0NCg0KICAgICAgcmV0dXJuIHRydWU7DQogICAgfQ0KDQogICAgZnVuY3Rpb24gc3RhcnQoKSB7DQogICAgICBpZiAobW91bnRQcm9kdWN0cygpKSB7DQogICAgICAgIHJldHVybjsNCiAgICAgIH0NCg0KICAgICAgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcihtb3VudFByb2R1Y3RzKTsNCiAgICAgIG9ic2VydmVyLm9ic2VydmUoZG9jdW1lbnQuYm9keSwgew0KICAgICAgICBjaGlsZExpc3Q6IHRydWUsDQogICAgICAgIHN1YnRyZWU6IHRydWUNCiAgICAgIH0pOw0KDQogICAgICB3aW5kb3cuc2V0VGltZW91dChmdW5jdGlvbiAoKSB7DQogICAgICAgIGlmIChvYnNlcnZlcikgew0KICAgICAgICAgIG9ic2VydmVyLmRpc2Nvbm5lY3QoKTsNCiAgICAgICAgfQ0KICAgICAgfSwgODAwMCk7DQogICAgfQ0KDQogICAgaWYgKGRvY3VtZW50LnJlYWR5U3RhdGUgPT09ICJjb21wbGV0ZSIpIHsNCiAgICAgIHN0YXJ0KCk7DQogICAgICB0cnkgew0KICAgICAgICBtb3VudEJhbm5lcigpOw0KICAgICAgfSBjYXRjaCAoZXJyb3IpIHsNCiAgICAgICAgaWYgKGJhbm5lcikgew0KICAgICAgICAgIGJhbm5lci5oaWRkZW4gPSB0cnVlOw0KICAgICAgICB9DQogICAgICB9DQogICAgfSBlbHNlIHsNCiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCJsb2FkIiwgZnVuY3Rpb24gKCkgew0KICAgICAgICBzdGFydCgpOw0KICAgICAgICB0cnkgew0KICAgICAgICAgIG1vdW50QmFubmVyKCk7DQogICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7DQogICAgICAgICAgaWYgKGJhbm5lcikgew0KICAgICAgICAgICAgYmFubmVyLmhpZGRlbiA9IHRydWU7DQogICAgICAgICAgfQ0KICAgICAgICB9DQogICAgICB9LCB7IG9uY2U6IHRydWUgfSk7DQogICAgfQ0KICB9KSgpOw0KPC9zY3JpcHQ+';
  const BANNER_STYLES = `.mt-banner-grid {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 500px)) !important;
  gap: 24px !important;
  justify-content: space-between !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

.mt-banner-grid .mt-banner-item {
  display: block !important;
  width: 100% !important;
  max-width: 500px !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}

.mt-banner-grid .mt-banner-card {
  display: grid !important;
  grid-template-rows: auto 100px !important;
  width: 100% !important;
  max-width: 500px !important;
  height: auto !important;
  max-height: 382px !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  border: 0 !important;
  border-radius: 10px !important;
  background: #000 !important;
  color: #fff !important;
  text-decoration: none !important;
  box-sizing: border-box !important;
}

.mt-banner-grid .mt-banner-card--disabled {
  cursor: default !important;
  filter: grayscale(1) !important;
  opacity: .58 !important;
  pointer-events: none !important;
}

.mt-banner-grid .mt-banner-media {
  display: block !important;
  width: 100% !important;
  height: auto !important;
  aspect-ratio: 16 / 9 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  background: #111 !important;
}

.mt-banner-grid .mt-banner-img {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  object-fit: cover !important;
  object-position: center !important;
}

.mt-banner-grid .mt-banner-info {
  display: block !important;
  width: 100% !important;
  height: 100px !important;
  margin: 0 !important;
  padding: 9px 18px !important;
  overflow: hidden !important;
  background: #000 !important;
  box-sizing: border-box !important;
}

.mt-banner-grid .mt-banner-title {
  display: -webkit-box !important;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
  color: #fff !important;
  font-family: Arial, sans-serif !important;
  font-size: 20px !important;
  font-weight: 900 !important;
  line-height: 20px !important;
  letter-spacing: -0.04em !important;
  text-decoration: none !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 2 !important;
}

.mt-banner-grid .mt-banner-title-accent {
  color: #ffe001 !important;
}

.mt-banner-grid .mt-banner-date {
  display: inline-flex !important;
  align-items: center !important;
  min-height: 30px !important;
  margin: 10px 0 0 !important;
  padding: 6px 12px !important;
  border: 0 !important;
  border-radius: 6px !important;
  background: #ffe001 !important;
  color: #000 !important;
  font-family: Arial, sans-serif !important;
  font-size: 14px !important;
  font-weight: 800 !important;
  line-height: 18px !important;
  text-decoration: none !important;
  box-sizing: border-box !important;
}

@media (max-width: 1279px) {
  .mt-banner-grid {
    grid-template-columns: repeat(2, minmax(0, 500px)) !important;
  }
}

@media (max-width: 768px) {
  .mt-banner-grid {
    grid-template-columns: minmax(0, 500px) !important;
    gap: 16px !important;
  }
}`;

  const BANNER_SCRIPT = `<script>
  (function () {
    "use strict";

    var dayMs = 86400000;
    var minuteMs = 60000;

    function getDayWord(days) {
      var value = Math.abs(days);
      var lastTwo = value % 100;
      var lastOne = value % 10;

      if (lastTwo >= 11 && lastTwo <= 14) {
        return "днів";
      }

      if (lastOne === 1) {
        return "день";
      }

      if (lastOne >= 2 && lastOne <= 4) {
        return "дні";
      }

      return "днів";
    }

    function getEndTime(dateString, timeString) {
      var parts = String(dateString || "").split("-").map(Number);
      var timeParts = String(timeString || "23:59").split(":").map(Number);

      if (parts.length !== 3 || parts.some(Number.isNaN)) {
        return 0;
      }

      if (timeParts.length < 2 || timeParts.some(Number.isNaN)) {
        timeParts = [23, 59];
      }

      return new Date(parts[0], parts[1] - 1, parts[2], timeParts[0], timeParts[1], 59, 999).getTime();
    }

    function getTimeRemaining(dateString, timeString) {
      return getEndTime(dateString, timeString) - Date.now();
    }

    function getDatePhrase(dateString, timeString) {
      var remaining = getTimeRemaining(dateString, timeString);

      if (remaining < 0) {
        return "Акція завершена";
      }

      if (remaining >= dayMs) {
        var days = Math.floor(remaining / dayMs);

        return "До закінчення акції " + days + " " + getDayWord(days);
      }

      var totalMinutes = Math.max(0, Math.floor(remaining / minuteMs));
      var hours = Math.floor(totalMinutes / 60);
      var minutes = totalMinutes % 60;

      return "До закінчення акції " + hours + " год " + String(minutes).padStart(2, "0") + " хв";
    }

    function isExpired(dateString, timeString) {
      return getTimeRemaining(dateString, timeString) < 0;
    }

    function refreshBanners() {
      var cards = document.querySelectorAll(".mt-banner-card[data-mt-end-date]");

      Array.prototype.forEach.call(cards, function (card) {
        var endDate = card.getAttribute("data-mt-end-date");
        var endTime = card.getAttribute("data-mt-end-time");
        var expired = isExpired(endDate, endTime);
        var date = card.querySelector(".mt-banner-date");

        if (date) {
          date.textContent = getDatePhrase(endDate, endTime);
        }

        if (!expired || card.getAttribute("data-mt-disable-expired") !== "true") {
          return;
        }

        card.classList.add("mt-banner-card--disabled");
        card.removeAttribute("href");
        card.removeAttribute("target");
        card.removeAttribute("rel");
        card.setAttribute("aria-disabled", "true");
        card.setAttribute("tabindex", "-1");
      });
    }

    refreshBanners();
    window.setInterval(refreshBanners, 60000);
  })();
</script>`;

  const forms = document.getElementById('banner-forms');
  const preview = document.getElementById('banner-preview');
  const template = document.getElementById('banner-form-template');
  const addButton = document.getElementById('add-banner');
  const copyAllButton = document.getElementById('copy-all');
  const code = document.getElementById('generated-code');
  const bannerShareDescription = document.getElementById('banner-share-description');
  const counter = document.getElementById('banner-counter');
  const summary = document.getElementById('code-summary');
  const toast = document.getElementById('copy-toast');
  const tabButtons = Array.from(document.querySelectorAll('[data-tab-target]'));
  const pages = Array.from(document.querySelectorAll('.mt-banner-builder__page'));
  const mobilePageTitle = document.getElementById('mobile-page-title');
  const builderSectionTabs = document.getElementById('builder-section-tabs');
  const builderPageIds = ['banner-grid-page', 'saved-grids-page', 'saved-banners-page'];
  const productsCode = document.getElementById('products-code');
  const copyProductsButton = document.getElementById('copy-products-code');
  const globalProductCode = document.getElementById('global-product-code');
  const copyGlobalProductButton = document.getElementById('copy-global-product-code');
  const productsShareDescription = document.getElementById('products-share-description');
  const productsBannerInputs = {
    imageUrl: document.getElementById('products-banner-image-url'),
    linkUrl: document.getElementById('products-banner-link-url'),
    alt: document.getElementById('products-banner-alt')
  };
  const productsOldPriceInputs = {
    percent: document.getElementById('products-old-price-percent'),
    fixed: document.getElementById('products-old-price-fixed')
  };
  const gridNameInput = document.getElementById('grid-name');
  const saveGridButton = document.getElementById('save-grid');
  const newGridButton = document.getElementById('new-grid');
  const gridEditingState = document.getElementById('grid-editing-state');
  const savedGridsSearch = document.getElementById('saved-grids-search');
  const savedGridsList = document.getElementById('saved-grids-list');
  const savedGridsSummary = document.getElementById('saved-grids-summary');
  const savedBannersSearch = document.getElementById('saved-banners-search');
  const savedBannersList = document.getElementById('saved-banners-list');
  const savedBannersSummary = document.getElementById('saved-banners-summary');
  const api = window.MTApi;
  let toastTimer;
  const copyButtonTimers = new WeakMap();
  let productsCodeTemplate = '';
  let savedGrids = [];
  let savedBanners = [];
  let editingGridId = null;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function buildShareDescriptionHtml(description, className) {
    const text = String(description || '').replace(/\s+/g, ' ').trim();

    if (!text) {
      return '';
    }

    return [
      `<meta name="description" content="${escapeHtml(text)}">`,
      `<meta property="og:description" content="${escapeHtml(text)}">`,
      `<meta name="twitter:description" content="${escapeHtml(text)}">`,
      `<p class="${className}" style="position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;">${escapeHtml(text)}</p>`
    ].join('\n');
  }

  function protectStyleBlocks(html) {
    return html;
  }

  function protectScriptBlocks(html) {
    return html;
  }

  function protectCodeBlocks(html) {
    return protectScriptBlocks(protectStyleBlocks(html));
  }

  async function loadRemoteCollections() {
    savedGridsSummary.textContent = 'Завантаження…';
    savedBannersSummary.textContent = 'Завантаження…';

    try {
      const [grids, banners] = await Promise.all([
        api.grids.list(),
        api.banners.list()
      ]);
      savedGrids = Array.isArray(grids) ? grids : [];
      savedBanners = Array.isArray(banners) ? banners : [];
      renderSavedGrids();
      renderSavedBanners();
    } catch (error) {
      showToast(error.message || 'Не вдалося завантажити збережені дані.', true);
    }
  }

  function normalizeBanner(banner) {
    const source = banner && typeof banner === 'object' ? banner : {};
    return {
      title: String(source.title || ''),
      endDate: String(source.endDate || ''),
      endTime: String(source.endTime || ''),
      imageUrl: String(source.imageUrl || ''),
      targetUrl: String(source.targetUrl || ''),
      disableWhenExpired: Boolean(source.disableWhenExpired)
    };
  }

  function hasBannerContent(banner) {
    const normalized = normalizeBanner(banner);
    return Boolean(
      normalized.title ||
      normalized.endDate ||
      normalized.endTime ||
      normalized.imageUrl ||
      normalized.targetUrl ||
      normalized.disableWhenExpired
    );
  }

  function getCurrentBanners() {
    return Array.from(forms.querySelectorAll('.mt-banner-builder__item')).map(readBanner);
  }

  function setEditingGrid(gridId) {
    editingGridId = gridId || null;
    gridEditingState.hidden = !editingGridId;
    gridEditingState.textContent = editingGridId ? 'Режим редагування' : '';
    saveGridButton.textContent = editingGridId ? 'Оновити сітку' : 'Зберегти сітку';
  }

  function replaceEditorBanners(banners, savedBannerId) {
    forms.replaceChildren();
    const normalized = Array.isArray(banners) && banners.length
      ? banners.map(normalizeBanner)
      : [normalizeBanner({})];

    normalized.forEach((banner, index) => {
      addBanner(banner, {
        savedBannerId: index === 0 ? savedBannerId : '',
        skipUpdate: true
      });
    });
    update();
  }

  function resetGridEditor(askConfirmation) {
    if (askConfirmation && getCurrentBanners().some(hasBannerContent)) {
      const accepted = window.confirm('Очистити поточну сітку та створити нову?');
      if (!accepted) return false;
    }

    gridNameInput.value = '';
    bannerShareDescription.value = '';
    setEditingGrid(null);
    replaceEditorBanners([]);
    return true;
  }

  async function saveCurrentGrid() {
    const name = gridNameInput.value.trim();
    const banners = getCurrentBanners();

    if (!name) {
      gridNameInput.focus();
      showToast('Вкажіть назву банерної сітки.', true);
      return;
    }

    if (!banners.some(hasBannerContent)) {
      showToast('Додайте хоча б один банер перед збереженням.', true);
      return;
    }

    const existingIndex = savedGrids.findIndex((grid) => grid.id === editingGridId);
    const existing = existingIndex >= 0 ? savedGrids[existingIndex] : null;
    const payload = {
      name,
      banners: banners.map(normalizeBanner),
      shareDescription: bannerShareDescription.value.trim()
    };

    saveGridButton.disabled = true;
    try {
      const record = existing
        ? await api.grids.update(existing.id, payload)
        : await api.grids.create(payload);
      if (existingIndex >= 0) {
        savedGrids.splice(existingIndex, 1, record);
      } else {
        savedGrids.unshift(record);
      }
      setEditingGrid(record.id);
      renderSavedGrids();
      showToast(existing ? 'Сітку оновлено.' : 'Сітку збережено.', false);
    } catch (error) {
      showToast(error.message || 'Не вдалося зберегти сітку.', true);
    } finally {
      saveGridButton.disabled = false;
    }
  }

  async function saveBannerItem(item) {
    const banner = readBanner(item);

    if (!isValid(banner)) {
      showToast('Заповніть усі обов’язкові поля банера.', true);
      return;
    }

    const savedBannerId = item.dataset.savedBannerId || '';
    const existingIndex = savedBanners.findIndex((record) => record.id === savedBannerId);
    const existing = existingIndex >= 0 ? savedBanners[existingIndex] : null;
    const payload = {
      name: banner.title,
      banner: normalizeBanner(banner)
    };
    const button = item.querySelector('.mt-banner-builder__button--save-one');

    button.disabled = true;
    try {
      const record = existing
        ? await api.banners.update(existing.id, payload)
        : await api.banners.create(payload);
      if (existingIndex >= 0) {
        savedBanners.splice(existingIndex, 1, record);
      } else {
        savedBanners.unshift(record);
      }
      item.dataset.savedBannerId = record.id;
      update();
      renderSavedBanners();
      showToast(existing ? 'Банер оновлено.' : 'Банер збережено.', false);
    } catch (error) {
      showToast(error.message || 'Не вдалося зберегти банер.', true);
    } finally {
      button.disabled = false;
    }
  }

  function loadGridForEditing(gridId) {
    const grid = savedGrids.find((record) => record.id === gridId);
    if (!grid) return;

    const isOwner = grid.isOwner !== false;
    gridNameInput.value = String(grid.name || '');
    bannerShareDescription.value = String(grid.shareDescription || '');
    setEditingGrid(isOwner ? grid.id : null);
    replaceEditorBanners(grid.banners || []);
    switchTab('banner-grid-page');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(isOwner ? 'Сітку відкрито для редагування.' : 'Сітку відкрито як нову копію.', false);
  }

  function loadBannerForEditing(bannerId) {
    const record = savedBanners.find((item) => item.id === bannerId);
    if (!record) return;

    const isOwner = record.isOwner !== false;
    gridNameInput.value = '';
    bannerShareDescription.value = '';
    setEditingGrid(null);
    replaceEditorBanners([record.banner], isOwner ? record.id : '');
    switchTab('banner-grid-page');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(isOwner ? 'Банер відкрито для редагування.' : 'Банер відкрито як нову копію.', false);
  }

  function addSavedBannerToGrid(bannerId) {
    const record = savedBanners.find((item) => item.id === bannerId);
    if (!record) return;

    const currentItems = Array.from(forms.querySelectorAll('.mt-banner-builder__item'));
    if (currentItems.length === 1 && !hasBannerContent(readBanner(currentItems[0]))) {
      currentItems[0].remove();
    }

    addBanner(record.banner);
    switchTab('banner-grid-page');
    showToast('Банер додано до поточної сітки.', false);
  }

  async function deleteSavedGrid(gridId) {
    const grid = savedGrids.find((record) => record.id === gridId);
    if (!grid || !window.confirm(`Видалити сітку «${grid.name}»?`)) return;

    try {
      await api.grids.remove(gridId);
      savedGrids = savedGrids.filter((record) => record.id !== gridId);
      if (editingGridId === gridId) setEditingGrid(null);
      renderSavedGrids();
      showToast('Сітку видалено.', false);
    } catch (error) {
      showToast(error.message || 'Не вдалося видалити сітку.', true);
    }
  }

  async function deleteSavedBanner(bannerId) {
    const record = savedBanners.find((item) => item.id === bannerId);
    if (!record || !window.confirm(`Видалити банер «${record.name}»?`)) return;

    try {
      await api.banners.remove(bannerId);
      savedBanners = savedBanners.filter((item) => item.id !== bannerId);
      forms.querySelectorAll(`[data-saved-banner-id="${bannerId}"]`).forEach((item) => {
        delete item.dataset.savedBannerId;
      });
      update();
      renderSavedBanners();
      showToast('Банер видалено.', false);
    } catch (error) {
      showToast(error.message || 'Не вдалося видалити банер.', true);
    }
  }

  function formatSavedDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'дата невідома';
    return new Intl.DateTimeFormat('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function matchesSearch(value, query) {
    return String(value || '').toLocaleLowerCase('uk-UA').includes(query.toLocaleLowerCase('uk-UA'));
  }

  function createLibraryButton(text, modifier, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mt-banner-builder__button ${modifier}`;
    button.textContent = text;
    button.addEventListener('click', handler);
    return button;
  }

  function createLibraryThumb(imageUrl, alt) {
    const thumb = document.createElement('span');
    thumb.className = 'mt-banner-builder__library-thumb';

    if (!imageUrl) {
      thumb.classList.add('mt-banner-builder__library-thumb--empty');
      return thumb;
    }

    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = alt || '';
    image.loading = 'lazy';
    image.addEventListener('error', function () {
      image.remove();
      thumb.classList.add('mt-banner-builder__library-thumb--empty');
    });
    thumb.appendChild(image);
    return thumb;
  }

  function createLibraryCard(record, type) {
    const isGrid = type === 'grid';
    const isOwner = record.isOwner !== false;
    const banners = isGrid ? (Array.isArray(record.banners) ? record.banners : []) : [record.banner];
    const firstBanner = normalizeBanner(banners[0]);
    const card = document.createElement('article');
    const main = document.createElement('div');
    const content = document.createElement('div');
    const title = document.createElement('h3');
    const meta = document.createElement('p');
    const actions = document.createElement('div');

    card.className = 'mt-banner-builder__library-card';
    main.className = 'mt-banner-builder__library-card-main';
    content.className = 'mt-banner-builder__library-card-content';
    title.className = 'mt-banner-builder__library-card-title';
    meta.className = 'mt-banner-builder__library-meta';
    actions.className = 'mt-banner-builder__library-actions';
    title.textContent = record.name || firstBanner.title || 'Без назви';
    const ownerLabel = record.owner?.name ? ` · Автор: ${record.owner.name}` : '';
    meta.textContent = (isGrid
      ? `${formatCount(banners.length)} · Оновлено ${formatSavedDate(record.updatedAt)}`
      : `Акція до ${firstBanner.endDate || 'не вказано'} · Оновлено ${formatSavedDate(record.updatedAt)}`) + ownerLabel;

    content.append(title, meta);
    main.append(createLibraryThumb(firstBanner.imageUrl, title.textContent), content);
    card.append(main, actions);

    if (isGrid) {
      actions.append(
        createLibraryButton(isOwner ? 'Редагувати' : 'Використати як копію', 'mt-banner-builder__button--primary', () => loadGridForEditing(record.id)),
        createLibraryButton('Копіювати код', 'mt-banner-builder__button--secondary', function () {
          const valid = banners.map(normalizeBanner).filter(isValid);
          copyText(buildExport(valid, record.shareDescription || ''), 'Код сітки скопійовано', this);
        })
      );
      if (isOwner) {
        actions.append(createLibraryButton('Видалити', 'mt-banner-builder__button--danger', () => deleteSavedGrid(record.id)));
      }
    } else {
      actions.append(
        createLibraryButton(isOwner ? 'Редагувати' : 'Використати як копію', 'mt-banner-builder__button--primary', () => loadBannerForEditing(record.id)),
        createLibraryButton('Додати в сітку', 'mt-banner-builder__button--secondary', () => addSavedBannerToGrid(record.id)),
        createLibraryButton('Копіювати HTML', 'mt-banner-builder__button--copy-one', function () {
          copyText(buildBannerHtml(firstBanner, 0), 'HTML банера скопійовано', this);
        })
      );
      if (isOwner) {
        actions.append(createLibraryButton('Видалити', 'mt-banner-builder__button--danger', () => deleteSavedBanner(record.id)));
      }
    }

    return card;
  }

  function renderLibraryEmpty(container, text) {
    const empty = document.createElement('div');
    empty.className = 'mt-banner-builder__empty';
    empty.textContent = text;
    container.appendChild(empty);
  }

  function renderSavedGrids() {
    const query = savedGridsSearch.value.trim();
    const filtered = savedGrids
      .filter((record) => matchesSearch(record.name, query))
      .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));

    savedGridsList.replaceChildren();
    filtered.forEach((record) => savedGridsList.appendChild(createLibraryCard(record, 'grid')));
    if (!filtered.length) {
      renderLibraryEmpty(
        savedGridsList,
        savedGrids.length ? 'За цим запитом сіток не знайдено.' : 'Тут з’являться збережені банерні сітки.'
      );
    }
    savedGridsSummary.textContent = query
      ? `Знайдено: ${filtered.length} із ${savedGrids.length}`
      : `Усього збережено: ${savedGrids.length}`;
  }

  function renderSavedBanners() {
    const query = savedBannersSearch.value.trim();
    const filtered = savedBanners
      .filter((record) => matchesSearch(record.name, query))
      .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));

    savedBannersList.replaceChildren();
    filtered.forEach((record) => savedBannersList.appendChild(createLibraryCard(record, 'banner')));
    if (!filtered.length) {
      renderLibraryEmpty(
        savedBannersList,
        savedBanners.length ? 'За цим запитом банерів не знайдено.' : 'Тут з’являться окремо збережені банери.'
      );
    }
    savedBannersSummary.textContent = query
      ? `Знайдено: ${filtered.length} із ${savedBanners.length}`
      : `Усього збережено: ${savedBanners.length}`;
  }

  function decodeBase64Utf8(value) {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

    if (window.TextDecoder) {
      return new TextDecoder('utf-8').decode(bytes);
    }

    return decodeURIComponent(Array.from(bytes, (byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''));
  }

  function switchTab(targetId) {
    const isBuilderPage = builderPageIds.includes(targetId);
    const activeButton = tabButtons.find((button) => (
      button.dataset.tabTarget === targetId && !button.dataset.navSection
    )) || tabButtons.find((button) => button.dataset.tabTarget === targetId);

    tabButtons.forEach((button) => {
      const isActive = button.dataset.navSection === 'builder'
        ? isBuilderPage
        : button.dataset.tabTarget === targetId;
      button.classList.toggle('mt-banner-builder__tab--active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    pages.forEach((page) => {
      const isActive = page.id === targetId;
      page.hidden = !isActive;
      page.classList.toggle('mt-banner-builder__page--active', isActive);
    });

    builderSectionTabs.hidden = !isBuilderPage;

    if (activeButton && mobilePageTitle) {
      mobilePageTitle.textContent = activeButton.dataset.pageTitle || activeButton.textContent.trim();
    }

    if (targetId === 'banner-grid-page') {
      updatePreviewScale();
    }
  }

  function getPositiveNumber(input) {
    const value = Number.parseFloat(input.value.replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function buildOldPriceCode(percent, fixed) {
    if (!percent && !fixed) {
      return '';
    }

    return `<style type="text/css">
.hs-products__native .hs-products-old-price {
  display: block !important;
  margin: 0 0 3px !important;
  color: #8a8f98 !important;
  font-size: 16px !important;
  font-weight: 500 !important;
  line-height: 1.2 !important;
  text-decoration: line-through !important;
}
</style>
<script>
  (function () {
    "use strict";

    var root = document.getElementById("hs-inline-products");

    if (!root) {
      return;
    }

    var percent = Number(root.getAttribute("data-old-price-percent") || 0);
    var fixed = Number(root.getAttribute("data-old-price-fixed") || 0);

    if (!(percent > 0) && !(fixed > 0)) {
      return;
    }

    function addOldPrices() {
      var prices = root.querySelectorAll(
        ".productsSlider-price, .catalog-card__price"
      );

      Array.prototype.forEach.call(prices, function (price) {
        if (price.querySelector(".hs-products-old-price")) {
          return;
        }

        var rawPrice = (price.textContent || "").trim();
        var match = rawPrice.match(/\\d[\\d\\s\\u00a0]*(?:[.,]\\d{1,2})?/);

        if (!match) {
          return;
        }

        var current = Number(match[0].replace(/[\\s\\u00a0]/g, "").replace(",", "."));

        if (!Number.isFinite(current)) {
          return;
        }

        var oldValue = percent > 0
          ? current * (1 + percent / 100)
          : current + fixed;
        oldValue = percent > 0
          ? Math.floor(oldValue / 10) * 10
          : Math.round(oldValue * 100) / 100;
        var fractionDigits = Number.isInteger(oldValue) ? 0 : 2;
        var prefix = rawPrice.slice(0, match.index).trim();
        var suffix = rawPrice.slice(match.index + match[0].length).trim();
        var formatted = new Intl.NumberFormat("uk-UA", {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits
        }).format(oldValue);
        var oldPrice = document.createElement("span");

        oldPrice.className = "hs-products-old-price";
        oldPrice.textContent =
          (prefix ? prefix + " " : "") +
          formatted +
          (suffix ? " " + suffix : " грн");
        price.insertBefore(oldPrice, price.firstChild);
      });
    }

    function addPromoParameters() {
      var links = root.querySelectorAll(
        ".productsSlider-i a[href], .catalog-card a[href]"
      );

      Array.prototype.forEach.call(links, function (link) {
        try {
          var url = new URL(link.getAttribute("href"), window.location.href);

          if (!/^https?:$/.test(url.protocol) || url.origin !== window.location.origin) {
            return;
          }

          if (percent > 0) {
            url.searchParams.set("mt_old_percent", String(percent));
            url.searchParams.delete("mt_old_fixed");
          } else {
            url.searchParams.set("mt_old_fixed", String(fixed));
            url.searchParams.delete("mt_old_percent");
          }
          url.searchParams.set("mt_promo_price", "1");

          link.href = url.toString();
        } catch (error) {
          return;
        }
      });
    }

    function refreshProducts() {
      addOldPrices();
      addPromoParameters();
    }

    refreshProducts();

    var observer = new MutationObserver(refreshProducts);
    observer.observe(root, {
      childList: true,
      subtree: true
    });
  })();
</script>`;
  }

  function buildMobileProductsCode() {
    return `<style type="text/css">
#hs-inline-products,
#hs-inline-products .hs-products__mount {
  width: 100% !important;
  max-width: none !important;
  box-sizing: border-box !important;
}

.hs-products__native.related-goods {
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: visible !important;
  box-sizing: border-box !important;
}

.hs-products__native.related-goods > .heading {
  display: none !important;
}

.hs-products__native .carousel {
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: visible !important;
  box-sizing: border-box !important;
}

.hs-products__native .carousel__wrapper {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 20px !important;
  width: 100% !important;
  max-width: none !important;
  height: auto !important;
  margin: 0 !important;
  padding: 0 !important;
  transform: none !important;
}

.hs-products__native .carousel__item {
  display: block !important;
  flex: none !important;
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  height: auto !important;
  margin: 0 !important;
  padding: 0 !important;
  transform: none !important;
}

.hs-products__native .catalog-card {
  display: flex !important;
  flex-direction: column !important;
  width: 100% !important;
  max-width: none !important;
  height: 100% !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 18px !important;
  border: 1px solid #e2e2dc !important;
  border-radius: 10px !important;
  background: #fff !important;
  box-sizing: border-box !important;
  box-shadow: none !important;
  cursor: pointer !important;
}

.hs-products__native .catalog-card__image,
.hs-products__native .catalog-card__image .image,
.hs-products__native .catalog-card__image .image__box {
  display: block !important;
  width: 100% !important;
  height: auto !important;
  margin: 0 !important;
  padding: 0 !important;
  aspect-ratio: 1 / 1 !important;
}

.hs-products__native .catalog-card__image img {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
}

.hs-products__native .catalog-card__content {
  display: flex !important;
  flex: 1 1 auto !important;
  flex-direction: column !important;
  min-width: 0 !important;
}

.hs-products__native .catalog-card__title {
  margin: 12px 0 0 !important;
}

.hs-products__native .catalog-card__title,
.hs-products__native .catalog-card__title a {
  color: #111 !important;
  font-size: 17px !important;
  font-weight: 600 !important;
  line-height: 1.4 !important;
  text-decoration: none !important;
}

.hs-products__native .catalog-card__prices {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  margin-top: auto !important;
  padding-top: 12px !important;
}

.hs-products__native .catalog-card__price {
  color: #ff0000 !important;
  font-size: 24px !important;
  font-weight: 800 !important;
  line-height: 1.25 !important;
}

.hs-products__native .catalog-card__price .hs-products-old-price {
  display: block !important;
  margin: 0 0 5px !important;
  color: #8a8f98 !important;
  font-size: 16px !important;
  font-weight: 500 !important;
  line-height: 1.2 !important;
  text-decoration: line-through !important;
}

.hs-products__native .catalog-card__purchase {
  display: block !important;
  width: 100% !important;
  max-width: none !important;
  margin-top: 14px !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}

.hs-products__native .catalog-card__buy-button,
.hs-products__native .catalog-card__purchase .btn {
  display: block !important;
  width: 100% !important;
  max-width: none !important;
  box-sizing: border-box !important;
}

.hs-products__native .catalog-card__buy-button > .j-buy-button-add.btn {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  max-width: none !important;
  min-height: 52px !important;
  margin: 0 !important;
  padding: 12px 18px !important;
  font-size: 18px !important;
  font-weight: 700 !important;
  line-height: 1.2 !important;
  box-sizing: border-box !important;
}

@media (max-width: 980px) {
  .hs-products__native .carousel__wrapper {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
}

@media (max-width: 720px) {
  .hs-products__native .carousel__wrapper {
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 14px !important;
  }

  .hs-products__native .carousel__item,
  .hs-products__native .catalog-card {
    width: 100% !important;
    max-width: none !important;
  }

  .hs-products__native .catalog-card__view {
    display: block !important;
    width: 100% !important;
    height: clamp(210px, 58vw, 250px) !important;
    overflow: hidden !important;
  }

  .hs-products__native .catalog-card__view > .catalog-card__link {
    display: block !important;
    width: 100% !important;
    height: 100% !important;
  }

  .hs-products__native .catalog-card__image,
  .hs-products__native .catalog-card__image .image,
  .hs-products__native .catalog-card__image .image__box {
    width: 100% !important;
    height: 100% !important;
    aspect-ratio: auto !important;
  }

  .hs-products__native .catalog-card__image img {
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
    object-fit: contain !important;
  }

  .hs-products__native .catalog-card__title,
  .hs-products__native .catalog-card__title a {
    font-size: 18px !important;
  }
}
</style>
<script>
  (function () {
    "use strict";

    var root = document.getElementById("hs-inline-products");

    if (!root) {
      return;
    }

    var mount = root.querySelector(".hs-products__mount");

    if (!mount) {
      return;
    }

    function findSource() {
      var candidates = document.querySelectorAll(".related-goods");

      for (var i = 0; i < candidates.length; i += 1) {
        if (
          !root.contains(candidates[i]) &&
          candidates[i].querySelector(".catalog-card")
        ) {
          return candidates[i];
        }
      }

      return null;
    }

    function mountProducts() {
      if (root.getAttribute("data-initialized") === "true") {
        return true;
      }

      var source = findSource();

      if (!source) {
        return false;
      }

      source.classList.add("hs-products__native");
      mount.appendChild(source);
      addMobileOldPrices(source);
      addMobilePromoParameters(source);
      enableCardLinks(source);
      root.hidden = false;
      root.setAttribute("data-initialized", "true");
      return true;
    }

    function addMobileOldPrices(source) {
      var percent = Number(root.getAttribute("data-old-price-percent") || 0);
      var fixed = Number(root.getAttribute("data-old-price-fixed") || 0);

      if (!(percent > 0) && !(fixed > 0)) {
        return;
      }

      var prices = source.querySelectorAll(".catalog-card__price");

      Array.prototype.forEach.call(prices, function (price) {
        if (price.querySelector(".hs-products-old-price")) {
          return;
        }

        var rawPrice = (price.textContent || "").trim();
        var match = rawPrice.match(/\\d[\\d\\s\\u00a0]*(?:[.,]\\d{1,2})?/);

        if (!match) {
          return;
        }

        var current = Number(
          match[0].replace(/[\\s\\u00a0]/g, "").replace(",", ".")
        );

        if (!Number.isFinite(current)) {
          return;
        }

        var oldValue = percent > 0
          ? current * (1 + percent / 100)
          : current + fixed;

        oldValue = percent > 0
          ? Math.floor(oldValue / 10) * 10
          : Math.round(oldValue * 100) / 100;

        var fractionDigits = Number.isInteger(oldValue) ? 0 : 2;
        var prefix = rawPrice.slice(0, match.index).trim();
        var suffix = rawPrice.slice(match.index + match[0].length).trim();
        var formatted = new Intl.NumberFormat("uk-UA", {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits
        }).format(oldValue);
        var oldPrice = document.createElement("span");

        oldPrice.className = "hs-products-old-price";
        oldPrice.textContent =
          (prefix ? prefix + " " : "") +
          formatted +
          (suffix ? " " + suffix : " \\u0433\\u0440\\u043d");

        price.insertBefore(oldPrice, price.firstChild);
      });
    }

    function addMobilePromoParameters(source) {
      var percent = Number(root.getAttribute("data-old-price-percent") || 0);
      var fixed = Number(root.getAttribute("data-old-price-fixed") || 0);

      if (!(percent > 0) && !(fixed > 0)) {
        return;
      }

      var links = source.querySelectorAll(".catalog-card a[href]");

      Array.prototype.forEach.call(links, function (link) {
        try {
          var url = new URL(link.getAttribute("href"), window.location.href);

          if (
            !/^https?:$/.test(url.protocol) ||
            url.origin !== window.location.origin
          ) {
            return;
          }

          if (percent > 0) {
            url.searchParams.set("mt_old_percent", String(percent));
            url.searchParams.delete("mt_old_fixed");
          } else {
            url.searchParams.set("mt_old_fixed", String(fixed));
            url.searchParams.delete("mt_old_percent");
          }

          url.searchParams.set("mt_promo_price", "1");
          link.href = url.toString();
        } catch (error) {
          return;
        }
      });
    }

    function enableCardLinks(source) {
      var cards = source.querySelectorAll(".catalog-card");

      Array.prototype.forEach.call(cards, function (card) {
        if (card.getAttribute("data-card-link-enabled") === "true") {
          return;
        }

        var productLink = card.querySelector(
          ".catalog-card__link[href], .catalog-card__title a[href]"
        );

        if (!productLink) {
          return;
        }

        card.setAttribute("data-card-link-enabled", "true");
        card.setAttribute("role", "link");
        card.setAttribute("tabindex", "0");

        card.addEventListener("click", function (event) {
          if (
            event.defaultPrevented ||
            event.target.closest(
              "a, button, input, select, textarea, label, [role='button']"
            )
          ) {
            return;
          }

          window.location.href = productLink.href;
        });

        card.addEventListener("keydown", function (event) {
          if (event.key === "Enter" && event.target === card) {
            window.location.href = productLink.href;
          }
        });
      });
    }

    function start() {
      if (mountProducts()) {
        return;
      }

      var observer = new MutationObserver(function () {
        if (mountProducts()) {
          observer.disconnect();
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      window.setTimeout(function () {
        observer.disconnect();
      }, 8000);
    }

    if (document.readyState === "complete") {
      start();
    } else {
      window.addEventListener("load", start, { once: true });
    }
  })();
</script>`;
  }

  function buildGlobalProductCode() {
    return `<!-- MT GLOBAL PRODUCT PRICE START -->
${protectCodeBlocks(`<style type="text/css">
.mt-product-price-stack {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  justify-content: flex-start !important;
}

.mt-product-current-price {
  display: block !important;
  width: auto !important;
  margin: 0 !important;
  color: #ff0000 !important;
}

.mt-product-old-price {
  display: block !important;
  width: auto !important;
  margin: 0 0 4px !important;
  color: #8a8f98 !important;
  font-size: 16px !important;
  font-weight: 500 !important;
  line-height: 1.2 !important;
  text-decoration: line-through !important;
}
</style>
<script>
  (function () {
    "use strict";

    var params = new URLSearchParams(window.location.search);
    var promoEnabled = params.get("mt_promo_price") === "1";
    var percent = Number(params.get("mt_old_percent") || 0);
    var fixed = Number(params.get("mt_old_fixed") || 0);

    if (!promoEnabled || (!(percent > 0) && !(fixed > 0))) {
      return;
    }

    if (percent > 0) {
      fixed = 0;
    }

    function parsePrice(text) {
      var source = String(text || "").trim();
      var match = source.match(/\\d[\\d\\s\\u00a0]*(?:[.,]\\d{1,2})?/);

      if (!match) {
        return null;
      }

      var value = Number(match[0].replace(/[\\s\\u00a0]/g, "").replace(",", "."));

      if (!Number.isFinite(value)) {
        return null;
      }

      return {
        value: value,
        prefix: source.slice(0, match.index).trim(),
        suffix: source.slice(match.index + match[0].length).trim()
      };
    }

    function findCurrentPrice() {
      var selectors = [
        ".product-card__price",
        ".product-price__item",
        ".product-price__current",
        ".product-price__value",
        ".product-price",
        ".product__price",
        ".product-info__price",
        "[itemprop='price']:not(meta)"
      ];

      for (var i = 0; i < selectors.length; i += 1) {
        var candidates = document.querySelectorAll(selectors[i]);

        for (var j = 0; j < candidates.length; j += 1) {
          var candidate = candidates[j];

          if (
            !candidate.classList.contains("mt-product-old-price") &&
            candidate.getClientRects().length &&
            parsePrice(candidate.textContent)
          ) {
            return candidate;
          }
        }
      }

      return null;
    }

    function applyProductPrice() {
      var price = findCurrentPrice();

      if (!price) {
        return false;
      }

      var priceParent = price.parentNode;
      var existingOldPrice = priceParent.querySelector(".mt-product-old-price");

      price.classList.add("mt-product-current-price");
      priceParent.classList.add("mt-product-price-stack");

      if (existingOldPrice) {
        return true;
      }

      var parsed = parsePrice(price.textContent);
      var oldValue = percent > 0
        ? parsed.value * (1 + percent / 100)
        : parsed.value + fixed;

      oldValue = percent > 0
        ? Math.floor(oldValue / 10) * 10
        : Math.round(oldValue * 100) / 100;

      var fractionDigits = Number.isInteger(oldValue) ? 0 : 2;
      var formatted = new Intl.NumberFormat("uk-UA", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
      }).format(oldValue);
      var oldPrice = document.createElement("span");

      oldPrice.className = "mt-product-old-price";
      oldPrice.textContent =
        (parsed.prefix ? parsed.prefix + " " : "") +
        formatted +
        (parsed.suffix ? " " + parsed.suffix : " грн");

      priceParent.insertBefore(oldPrice, price);
      return true;
    }

    applyProductPrice();

    var observer = new MutationObserver(function () {
      applyProductPrice();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

  })();
</script>`)}
<!-- MT GLOBAL PRODUCT PRICE END -->`;
  }

  function buildProductsCode() {
    const imageUrl = productsBannerInputs.imageUrl.value.trim();
    const linkUrl = productsBannerInputs.linkUrl.value.trim();
    const alt = productsBannerInputs.alt.value.trim();
    const percent = getPositiveNumber(productsOldPriceInputs.percent);
    const fixed = percent ? 0 : getPositiveNumber(productsOldPriceInputs.fixed);
    const description = buildShareDescriptionHtml(productsShareDescription.value, 'hs-share-description');
    const bannerLine =
      `<div class="hs-page-banner" data-alt="${escapeHtml(alt)}" data-image-url="${escapeHtml(imageUrl)}" data-link-url="${escapeHtml(linkUrl)}" hidden="" id="hs-page-banner">&nbsp;</div>`;

    const codeWithBanner = productsCodeTemplate.replace(
      /<div class="hs-page-banner"[^>]*>&nbsp;<\/div>/,
      bannerLine
    );
    const codeWithRedPrice = codeWithBanner.replace(
      /(\.hs-products__native \.productsSlider-price\s*\{[\s\S]*?\bcolor:\s*)#[0-9a-f]{3,8}(\s*;)/i,
      '$1#ff0000$2'
    );
    const priceSettings =
      `data-old-price-percent="${percent || ''}" data-old-price-fixed="${fixed || ''}" id="hs-inline-products"`;
    const codeWithPriceSettings = codeWithRedPrice.replace(
      'id="hs-inline-products"',
      priceSettings
    );
    const mobileProductsCode = buildMobileProductsCode();
    const oldPriceCode = buildOldPriceCode(percent, fixed);
    const completeCode =
      `${codeWithPriceSettings}\n${mobileProductsCode}` +
      (oldPriceCode ? `\n${oldPriceCode}` : '');
    const protectedCode = protectCodeBlocks(completeCode);

    return description ? `${description}\n${protectedCode}` : protectedCode;
  }

  function updateProductsCode() {
    productsCode.value = buildProductsCode();
    globalProductCode.value = buildGlobalProductCode();
  }

  function getDayWord(days) {
    const value = Math.abs(days);
    const lastTwo = value % 100;
    const lastOne = value % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return 'днів';
    if (lastOne === 1) return 'день';
    if (lastOne >= 2 && lastOne <= 4) return 'дні';
    return 'днів';
  }

  function getEndTime(dateString, timeString) {
    const parts = String(dateString || '').split('-').map(Number);
    let timeParts = String(timeString || '23:59').split(':').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
    if (timeParts.length < 2 || timeParts.some(Number.isNaN)) timeParts = [23, 59];
    return new Date(parts[0], parts[1] - 1, parts[2], timeParts[0], timeParts[1], 59, 999).getTime();
  }

  function getTimeRemaining(dateString, timeString) {
    return getEndTime(dateString, timeString) - Date.now();
  }

  function getDaysRemaining(dateString, timeString) {
    const remaining = getTimeRemaining(dateString, timeString);
    if (remaining < 0) return -1;
    if (remaining < DAY_MS) return 0;
    return Math.floor(remaining / DAY_MS);
  }

  function getDatePhrase(dateString, timeString) {
    if (!dateString) return 'До закінчення акції 0 днів';
    const remaining = getTimeRemaining(dateString, timeString);

    if (remaining < 0) {
      return 'Акція завершена';
    }

    if (remaining >= DAY_MS) {
      const days = Math.floor(remaining / DAY_MS);
      return `До закінчення акції ${days} ${getDayWord(days)}`;
    }

    const totalMinutes = Math.max(0, Math.floor(remaining / MINUTE_MS));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `До закінчення акції ${hours} год ${String(minutes).padStart(2, '0')} хв`;
  }

  function accentTitle(title) {
    return escapeHtml(title).replace(
      /(-\s*\d+(?:[.,]\d+)?\s*%)/g,
      '<span class="mt-banner-title-accent">$1</span>'
    );
  }

  function readBanner(item) {
    return {
      title: item.querySelector('[name="title"]').value.trim(),
      endDate: item.querySelector('[name="endDate"]').value,
      endTime: item.querySelector('[name="endTime"]').value,
      imageUrl: item.querySelector('[name="imageUrl"]').value.trim(),
      targetUrl: item.querySelector('[name="targetUrl"]').value.trim(),
      disableWhenExpired: item.querySelector('[name="disableWhenExpired"]').checked
    };
  }

  function isValid(banner) {
    return Boolean(banner.title && banner.endDate && banner.imageUrl && banner.targetUrl);
  }

  function isExpired(banner) {
    return Boolean(banner.endDate) && getDaysRemaining(banner.endDate, banner.endTime) < 0;
  }

  function isDisabledBanner(banner) {
    return Boolean(banner.disableWhenExpired && isExpired(banner));
  }

  // A block wrapper keeps every banner distinct after Horoshop reformats the source.
  function buildBannerHtml(banner, indent) {
    const i0 = '  '.repeat(indent);
    const i1 = '  '.repeat(indent + 1);
    const i2 = '  '.repeat(indent + 2);
    const i3 = '  '.repeat(indent + 3);
    const safeTitle = escapeHtml(banner.title);
    const safeHref = escapeHtml(banner.targetUrl);
    const safeSrc = escapeHtml(banner.imageUrl);
    const date = escapeHtml(getDatePhrase(banner.endDate, banner.endTime));
    const disabled = isDisabledBanner(banner);
    const cardTag = disabled ? 'span' : 'a';
    const cardClass = disabled ? 'mt-banner-card mt-banner-card--disabled' : 'mt-banner-card';
    const expiryAttrs = ` data-mt-end-date="${escapeHtml(banner.endDate)}" data-mt-end-time="${escapeHtml(banner.endTime || '')}"${
      banner.disableWhenExpired ? ' data-mt-disable-expired="true"' : ''
    }`;
    const cardAttrs = disabled
      ? `class="${cardClass}"${expiryAttrs} role="link" aria-disabled="true" tabindex="-1"`
      : `class="${cardClass}" href="${safeHref}"${expiryAttrs}`;

    return [
      `${i0}<!-- MT BANNER START -->`,
      `${i0}<div class="mt-banner-item">`,
      `${i1}<${cardTag} ${cardAttrs}>`,
      `${i2}<span class="mt-banner-media">`,
      `${i3}<img class="mt-banner-img" src="${safeSrc}" alt="${safeTitle}">`,
      `${i2}</span>`,
      `${i2}<span class="mt-banner-info">`,
      `${i3}<span class="mt-banner-title">${accentTitle(banner.title)}</span>`,
      `${i3}<span class="mt-banner-date">${date}</span>`,
      `${i2}</span>`,
      `${i1}</${cardTag}>`,
      `${i0}</div>`,
      `${i0}<!-- MT BANNER END -->`
    ].join('\n');
  }

  function buildGridHtml(banners) {
    return [
      '<div class="mt-banner-grid">',
      banners.map((banner) => buildBannerHtml(banner, 1)).join('\n\n'),
      '</div>'
    ].join('\n');
  }

  function buildExport(banners, shareDescription) {
    const descriptionText = shareDescription === undefined ? bannerShareDescription.value : shareDescription;
    const description = buildShareDescriptionHtml(descriptionText, 'mt-share-description');
    const body = protectCodeBlocks(`${buildGridHtml(banners)}\n\n<style type="text/css">\n${BANNER_STYLES}\n</style>\n\n${BANNER_SCRIPT}`);

    return description ? `${description}\n${body}` : body;
  }

  function createPreview(banner) {
    const wrapper = document.createElement('div');
    const disabled = isDisabledBanner(banner);
    const card = document.createElement(banner.targetUrl && !disabled ? 'a' : 'span');
    const media = document.createElement('span');
    const info = document.createElement('span');
    const title = document.createElement('span');
    const date = document.createElement('span');

    wrapper.className = 'mt-banner-item';
    card.className = 'mt-banner-card';
    if (disabled) {
      card.classList.add('mt-banner-card--disabled');
      card.setAttribute('role', 'link');
      card.setAttribute('aria-disabled', 'true');
    }
    media.className = 'mt-banner-media';
    info.className = 'mt-banner-info';
    title.className = 'mt-banner-title';
    date.className = 'mt-banner-date';

    if (banner.targetUrl && !disabled) {
      card.href = banner.targetUrl;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
    }

    if (banner.imageUrl) {
      const image = document.createElement('img');
      image.className = 'mt-banner-img';
      image.src = banner.imageUrl;
      image.alt = banner.title || 'Зображення банера';
      media.appendChild(image);
    }

    title.innerHTML = accentTitle(banner.title || 'Заголовок банера');
    date.textContent = getDatePhrase(banner.endDate, banner.endTime);
    info.append(title, date);
    card.append(media, info);
    wrapper.appendChild(card);
    return wrapper;
  }

  function formatCount(count) {
    if (count % 10 === 1 && count % 100 !== 11) return `${count} банер`;
    if ([2, 3, 4].includes(count % 10) && !(count % 100 >= 12 && count % 100 <= 14)) {
      return `${count} банери`;
    }
    return `${count} банерів`;
  }

  function updatePreviewScale() {
    const cardCount = preview.children.length;
    const columns = Math.min(3, Math.max(1, cardCount));
    const fullWidth = (columns * 500) + ((columns - 1) * 24);
    const previewShell = preview.parentElement;
    const shellStyles = window.getComputedStyle(previewShell);
    const horizontalPadding =
      parseFloat(shellStyles.paddingLeft) + parseFloat(shellStyles.paddingRight);
    const availableWidth = Math.max(1, previewShell.clientWidth - horizontalPadding);
    const scale = Math.min(1, availableWidth / fullWidth);

    preview.style.setProperty('--mt-preview-columns', String(columns));
    preview.style.setProperty('--mt-preview-scale', scale.toFixed(4));
  }

  function update() {
    const items = Array.from(forms.querySelectorAll('.mt-banner-builder__item'));
    const banners = items.map(readBanner);
    const valid = banners.filter(isValid);

    items.forEach((item, index) => {
      const banner = banners[index];
      const expired = isExpired(banner);
      const disabled = isDisabledBanner(banner);
      const ready = isValid(banner);
      const state = item.querySelector('.mt-banner-builder__item-state');

      item.querySelector('.mt-banner-builder__item-number').textContent = String(index + 1);
      item.querySelector('.mt-banner-builder__item-title').textContent = banner.title || `Банер ${index + 1}`;
      item.querySelector('.mt-banner-builder__button--danger').disabled = items.length === 1;
      item.querySelector('.mt-banner-builder__button--copy-one').disabled = !ready;
      item.querySelector('.mt-banner-builder__button--save-one').disabled = !ready;
      item.querySelector('.mt-banner-builder__button--save-one').textContent = item.dataset.savedBannerId
        ? 'Оновити банер'
        : 'Зберегти банер';
      state.className = 'mt-banner-builder__item-state';
      state.textContent = disabled ? 'Вимкнений' : expired ? 'Завершений' : ready ? 'Готовий' : 'Не готовий';
      if (disabled) state.classList.add('mt-banner-builder__item-state--disabled');
      if (expired) state.classList.add('mt-banner-builder__item-state--expired');
      if (ready && !expired) state.classList.add('mt-banner-builder__item-state--ready');
    });

    preview.replaceChildren();
    banners.forEach((banner) => {
      preview.appendChild(createPreview(banner));
    });
    updatePreviewScale();

    counter.textContent = formatCount(items.length);
    code.value = buildExport(valid);
    copyAllButton.disabled = valid.length === 0;
    summary.textContent = valid.length
      ? `${formatCount(valid.length)} у коді. Розмітка адаптована під редактор Хорошопу.`
      : 'Заповніть усі поля активного банера.';
  }

  function addBanner(banner, options) {
    const settings = options || {};
    const initial = normalizeBanner(banner);
    const fragment = template.content.cloneNode(true);
    const item = fragment.querySelector('.mt-banner-builder__item');
    item.querySelector('[name="title"]').value = initial.title;
    item.querySelector('[name="endDate"]').value = initial.endDate;
    item.querySelector('[name="endTime"]').value = initial.endTime;
    item.querySelector('[name="imageUrl"]').value = initial.imageUrl;
    item.querySelector('[name="targetUrl"]').value = initial.targetUrl;
    item.querySelector('[name="disableWhenExpired"]').checked = initial.disableWhenExpired;
    if (settings.savedBannerId) {
      item.dataset.savedBannerId = settings.savedBannerId;
    }
    item.addEventListener('input', update);
    item.addEventListener('change', update);

    item.querySelector('.mt-banner-builder__button--danger').addEventListener('click', function () {
      if (forms.children.length === 1) return;
      item.remove();
      update();
    });

    const copyOneButton = item.querySelector('.mt-banner-builder__button--copy-one');
    copyOneButton.addEventListener('click', function () {
      const banner = readBanner(item);
      if (isValid(banner)) {
        copyText(buildBannerHtml(banner, 0), 'HTML банера скопійовано', copyOneButton);
      }
    });

    item.querySelector('.mt-banner-builder__button--save-one').addEventListener('click', function () {
      saveBannerItem(item);
    });

    forms.appendChild(fragment);
    if (!settings.skipUpdate) update();
  }

  function showCopiedButtonState(button) {
    if (!button) {
      return;
    }

    const previousTimer = copyButtonTimers.get(button);

    if (previousTimer) {
      clearTimeout(previousTimer);
    }

    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent.trim();
    }

    button.textContent = 'Скопійовано';
    button.classList.add('mt-banner-builder__button--copied');

    const timer = setTimeout(function () {
      button.textContent = button.dataset.originalText;
      button.classList.remove('mt-banner-builder__button--copied');
      copyButtonTimers.delete(button);
    }, 1800);

    copyButtonTimers.set(button, timer);
  }

  async function copyText(text, message, button) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const helper = document.createElement('textarea');
        helper.value = text;
        helper.className = 'mt-banner-builder__clipboard-helper';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        helper.remove();
      }
      showCopiedButtonState(button);
      showToast(message, false);
    } catch (error) {
      showToast('Не вдалося скопіювати код.', true);
    }
  }

  function showToast(message, error) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('mt-banner-builder__toast--error', error);
    toast.classList.add('mt-banner-builder__toast--visible');
    toastTimer = setTimeout(() => toast.classList.remove('mt-banner-builder__toast--visible'), 2400);
  }

  addButton.addEventListener('click', function () {
    addBanner();
  });
  saveGridButton.addEventListener('click', saveCurrentGrid);
  newGridButton.addEventListener('click', function () {
    if (resetGridEditor(true)) {
      showToast('Створено нову порожню сітку.', false);
    }
  });
  savedGridsSearch.addEventListener('input', renderSavedGrids);
  savedBannersSearch.addEventListener('input', renderSavedBanners);
  tabButtons.forEach((button) => {
    button.addEventListener('click', function () {
      switchTab(button.dataset.tabTarget);
    });
  });
  Object.values(productsBannerInputs).forEach((input) => {
    input.addEventListener('input', updateProductsCode);
  });
  productsOldPriceInputs.percent.addEventListener('input', function () {
    if (productsOldPriceInputs.percent.value !== '') {
      productsOldPriceInputs.fixed.value = '';
    }
    updateProductsCode();
  });
  productsOldPriceInputs.fixed.addEventListener('input', function () {
    if (productsOldPriceInputs.fixed.value !== '') {
      productsOldPriceInputs.percent.value = '';
    }
    updateProductsCode();
  });
  bannerShareDescription.addEventListener('input', update);
  productsShareDescription.addEventListener('input', updateProductsCode);
  window.addEventListener('resize', updatePreviewScale);
  window.addEventListener('mt:authenticated', function () {
    switchTab('banner-grid-page');
    loadRemoteCollections();
  });
  window.addEventListener('mt:signed-out', function () {
    savedGrids = [];
    savedBanners = [];
    resetGridEditor(false);
    setEditingGrid(null);
    renderSavedGrids();
    renderSavedBanners();
  });
  window.addEventListener('mt:notify', function (event) {
    showToast(event.detail.message, Boolean(event.detail.error));
  });
  window.setInterval(update, 60000);
  copyAllButton.addEventListener('click', function () {
    copyText(code.value, 'HTML + CSS скопійовано', copyAllButton);
  });
  copyProductsButton.addEventListener('click', function () {
    copyText(productsCode.value, 'Код вибірки товарів скопійовано', copyProductsButton);
  });
  copyGlobalProductButton.addEventListener('click', function () {
    copyText(globalProductCode.value, 'Глобальний код скопійовано', copyGlobalProductButton);
  });

  productsCodeTemplate = decodeBase64Utf8(PRODUCTS_CODE_BASE64);
  updateProductsCode();
  renderSavedGrids();
  renderSavedBanners();
  addBanner();
})();
