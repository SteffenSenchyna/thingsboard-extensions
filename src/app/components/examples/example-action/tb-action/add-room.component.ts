function f(
  $event,
  widgetContext,
  entityId,
  entityName,
  htmlTemplate,
  additionalParams,
  entityLabel,
) {
  let $injector = widgetContext.$scope.$injector;
  let customDialog = $injector.get(
    widgetContext.servicesMap.get("customDialog"),
  );
  let assetService = $injector.get(
    widgetContext.servicesMap.get("assetService"),
  );
  let attributeService = $injector.get(
    widgetContext.servicesMap.get("attributeService"),
  );
  let entityRelationService = $injector.get(
    widgetContext.servicesMap.get("entityRelationService"),
  );
  let entityGroupService = $injector.get(
    widgetContext.servicesMap.get("entityGroupService"),
  );

  let zoneId = widgetContext.stateController.getStateParams()["zone"].entityId;
  openAddEntityDialog();

  function openAddEntityDialog() {
    customDialog
      .customDialog(htmlTemplate, AddEntityDialogController)
      .subscribe();
  }

  function AddEntityDialogController(instance) {
    let vm = instance;

    vm.allowedEntityTypes = ["ASSET", "DEVICE"];

    vm.addEntityFormGroup = vm.fb.group({
      entityName: ["", [vm.validators.required]],
      entityLabel: [null],
      type: ["", [vm.validators.required]],
    });

    vm.cancel = function () {
      vm.dialogRef.close(null);
    };

    vm.save = function () {
      vm.addEntityFormGroup.markAsPristine();
      saveEntityObservable()
        .pipe(
          widgetContext.rxjs.switchMap((entity) => saveAttributes(entity.id)),
        )
        .subscribe(() => {
          widgetContext.updateAliases();
          vm.dialogRef.close(null);
        });
    };

    function saveEntityObservable() {
      const formValues = vm.addEntityFormGroup.value;
      let entity = {
        name: `inn-room-${formValues.entityName}`,
        type: "QC_Room",
        label: formValues.entityLabel,
      };
      return assetService.saveAsset(entity);
    }

    function saveAttributes(entityId) {
      let attributes = vm.addEntityFormGroup.get("attributes").value;
      let attributesArray = getMapItemLocationAttributes();
      for (let key in attributes) {
        if (attributes[key] !== null) {
          attributesArray.push({ key: key, value: attributes[key] });
        }
      }
      if (attributesArray.length > 0) {
        return attributeService.saveEntityAttributes(
          entityId,
          "SERVER_SCOPE",
          attributesArray,
        );
      }
      return widgetContext.rxjs.of([]);
    }

    function saveRelation(entityId) {
      let relation = {
        type: "Contains",
        typeGroup: "COMMON",
        to: entityId,
        from: zoneId,
      };
      return entityRelationService.saveRelation(relation);
    }

    function getOrCreateAssetGroup(ownerId) {
      return getEntityGroupByName(
        ownerId,
        "Quality Control Assets",
        "ASSET",
      ).pipe(
        widgetContext.rxjs.switchMap((group) => {
          if (group) {
            return widgetContext.rxjs.of(group);
          } else {
            var assistedLiving = {
              type: "ASSET",
              name: "Quality Control Assets",
              ownerId: ownerId,
            };
            return entityGroupService.saveEntityGroup(assistedLiving);
          }
        }),
      );
    }

    function getEntityGroupByName(ownerId, groupName, groupType) {
      var entityGroupsPageLink = widgetContext.pageLink(10, 0, groupName);
      return entityGroupService
        .getEntityGroupsByOwnerIdAndPageLink(
          ownerId.entityType,
          ownerId.id,
          groupType,
          entityGroupsPageLink,
          { ignoreLoading: true },
        )
        .pipe(
          widgetContext.rxjs.map((data) => {
            if (data.data.length) {
              return data.data.find((group) => group.name === groupName);
            } else {
              return null;
            }
          }),
        );
    }

    function getMapItemLocationAttributes() {
      const attributes = [];
      const mapItemType = $event.shape;
      if (mapItemType === "Marker") {
        const mapType = widgetContext.mapInstance.type();
        attributes.push({
          key: mapType === "image" ? "xPos" : "latitude",
          value: additionalParams.coordinates.x,
        });
        attributes.push({
          key: mapType === "image" ? "yPos" : "longitude",
          value: additionalParams.coordinates.y,
        });
      } else if (mapItemType === "Rectangle" || mapItemType === "Polygon") {
        attributes.push({
          key: "perimeter",
          value: additionalParams.coordinates,
        });
      } else if (mapItemType === "Circle") {
        attributes.push({ key: "circle", value: additionalParams.coordinates });
      }
      return attributes;
    }
  }
}
