function placeMapItem(
  $event,
  widgetContext,
  entityId,
  entityName,
  htmlTemplate,
  additionalParams,
  entityLabel
) {
  // grab ThingsBoard services
  const $injector = widgetContext.$scope.$injector;
  const customDialog = $injector.get(
    widgetContext.servicesMap.get("customDialog")
  );
  const assetService = $injector.get(
    widgetContext.servicesMap.get("assetService")
  );
  const deviceService = $injector.get(
    widgetContext.servicesMap.get("deviceService")
  );
  const attributeService = $injector.get(
    widgetContext.servicesMap.get("attributeService")
  );

  const { shape, layer } = $event;
  const coords = additionalParams.coordinates;

  console.log(`Placing ${shape} for ${entityName} (${entityId}) at`, coords);

  // open your existing HTML template + controller
  customDialog
    .customDialog(htmlTemplate, AddEntityDialogController)
    .subscribe(() => {
      // refresh any aliases or widget data after dialog closes
      widgetContext.updateAliases();
    });

  // your full AddEntityDialogController, lifted in here so it
  // still sees $event, additionalParams, assetService, etc.
  function AddEntityDialogController(instance) {
    const vm = instance;
    vm.allowedEntityTypes = ["ASSET", "DEVICE"];

    vm.addEntityFormGroup = vm.fb.group({
      identifier: ["", [vm.validators.required]],
      label: ["", [vm.validators.required]],
    });

    vm.cancel = () => vm.dialogRef.close(null);

    vm.save = function () {
      const { identifier, label } = vm.addEntityFormGroup.value;
      const asset = {
        name: `inn-room-${identifier}`,
        type: "QC_Room",
        label: label,
      };
      assetService
        .saveAsset(asset)
        .pipe(
          widgetContext.rxjs.switchMap((entity) => saveAttributes(entity.id))
        )
        .subscribe(
          () => {
            widgetContext.updateAliases();
            vm.dialogRef.close(null);
          },
          (err) => console.error("Save failed", err)
        );
    };

    function saveAttributes(entityId) {
      const attrs = getMapItemLocationAttributes();
      return attrs.length
        ? attributeService.saveEntityAttributes(entityId, "SERVER_SCOPE", attrs)
        : widgetContext.rxjs.of([]);
    }

    function getMapItemLocationAttributes() {
      const arr = [];
      if (shape === "Marker") {
        const mapType = widgetContext.mapInstance.type();
        const keyLat = mapType === "image" ? "xPos" : "latitude";
        const keyLon = mapType === "image" ? "yPos" : "longitude";
        arr.push({ key: keyLat, value: coords.x });
        arr.push({ key: keyLon, value: coords.y });
      } else if (shape === "Rectangle" || shape === "Polygon") {
        arr.push({ key: "perimeter", value: coords });
      } else if (shape === "Circle") {
        arr.push({ key: "circle", value: coords });
      }
      return arr;
    }
  }
}
