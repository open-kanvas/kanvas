# Built-in geography

Natural Earth 1:110m boundaries, version 5.1.2, public domain.
Source: https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2/geojson
License: https://www.naturalearthdata.com/about/terms-of-use/
Files: ne_110m_admin_0_countries.geojson and ne_110m_admin_1_states_provinces.geojson.
Reduced properties only; geometry coordinates preserved unchanged. Country lookup uses ISO_A2_EH / ISO_A3_EH; states use ISO 3166-2 (US-XX). No geographic inference or runtime service.
Scale-limited: 174 ISO-coded country features, 51 US states/DC. Small territories/countries absent from this generalized dataset are explicitly rejected; callers can still supply custom GeoJSON. Boundaries are cartographic context, not a sovereignty determination.
Source SHA256:
ne_110m_admin_0_countries: 6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f
ne_110m_admin_1_states_provinces: 0067dec6a2c4f9c7a644bf7a9a46163d8d881595953326d0c67d89934190aefe
