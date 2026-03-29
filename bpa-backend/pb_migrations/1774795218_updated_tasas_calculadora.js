/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1039373703")

  // update collection data
  unmarshal({
    "name": "tasas_intereses"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1039373703")

  // update collection data
  unmarshal({
    "name": "tasas_calculadora"
  }, collection)

  return app.save(collection)
})
