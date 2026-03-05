/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3758627238")

  // update collection data
  unmarshal({
    "createRule": null,
    "listRule": "",
    "updateRule": null,
    "viewRule": ""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3758627238")

  // update collection data
  unmarshal({
    "createRule": "",
    "listRule": null,
    "updateRule": "",
    "viewRule": null
  }, collection)

  return app.save(collection)
})
