/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4200622837")

  // update collection data
  unmarshal({
    "name": "monedas"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4200622837")

  // update collection data
  unmarshal({
    "name": "tasas_cambio"
  }, collection)

  return app.save(collection)
})
