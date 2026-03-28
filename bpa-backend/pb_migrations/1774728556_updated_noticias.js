/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1109229884")

  // update collection data
  unmarshal({
    "name": "actualidad"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1109229884")

  // update collection data
  unmarshal({
    "name": "noticias"
  }, collection)

  return app.save(collection)
})
