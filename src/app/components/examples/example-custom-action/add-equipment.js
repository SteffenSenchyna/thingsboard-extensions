function f(
  $event,
  widgetContext,
  entityId,
  entityName,
  htmlTemplate,
  additionalParams,
  entityLabel
) {
  let $injector = widgetContext.$scope.$injector;
  let customDialog = $injector.get(
    widgetContext.servicesMap.get("customDialog")
  );
  let assetService = $injector.get(
    widgetContext.servicesMap.get("assetService")
  );
  let entityRelationService = $injector.get(
    widgetContext.servicesMap.get("entityRelationService")
  );
  let attributeService = $injector.get(
    widgetContext.servicesMap.get("attributeService")
  );
  let entityGroupService = $injector.get(
    widgetContext.servicesMap.get("entityGroupService")
  );

  let zoneId = widgetContext.stateController.getStateParams()["zone"].entityId;
  let zoneName = widgetContext.stateController.getStateParams()["zone"].name;
  let resolvedAliases = widgetContext.dashboard.aliasController.resolvedAliases;

  openAddEquipmentDialog();

  function openAddEquipmentDialog() {
    customDialog
      .customDialog(htmlTemplate, AddEquipmentDialogController)
      .subscribe();
  }

  function AddEquipmentDialogController(instance) {
    let vm = instance;

    vm.widgetContext = widgetContext;
    vm.step = 1;
    vm.equipment = null;

    // Available equipment types for the select input.
    vm.equipmentTypes = [
      {
        name: "Freezer",
        type: "QC_Freezer",
      },
      {
        name: "Bath",
        type: "QC_Bath",
      },
    ];

    vm.hasLocation = false;
    vm.locationSubscription = null;
    // vm.room is no longer set here; we will retrieve it from the form control in assignEquipment()
    vm.roomLocation = {};

    // Create a form group including controls for equipment name, type, and target room.
    vm.addEquipmentFormGroup = vm.fb.group({
      name: ["", [vm.validators.required]],
      type: ["", [vm.validators.required]],
      room: [null, [vm.validators.required]],
    });

    // Query for available rooms within the zone.
    var roomsQuery = {
      parameters: {
        rootId: zoneId.id,
        rootType: zoneId.entityType,
        direction: "FROM",
        maxLevel: 1,
      },
      relationType: "Contains",
      assetTypes: ["QC_Room"],
    };

    vm.rooms$ = assetService
      .findByQuery(roomsQuery)
      .pipe(widgetContext.rxjs.share());

    // Comparison function for matching selected room option.
    vm.entityComparisonFunction = function (option, value) {
      if (!option || !value) {
        return option === value;
      } else {
        return option.id.id === value.id.id;
      }
    };

    //Button actions

    // Cancel: if the user cancels, remove any location subscriptions and delete the asset (if created).
    vm.cancel = function () {
      cancelLocationSubscription();
      deleteEntityObservable().subscribe(function () {
        widgetContext.updateAliases();
        vm.dialogRef.close(null);
      });
    };

    // Next: create the equipment asset, create a relation to the selected room,
    // and initialize the equipment location with the room’s xPos and yPos.
    vm.next = function () {
      vm.addEquipmentFormGroup.markAsPristine();
      getCustomerId().subscribe(function (ownerId) {
        saveEntityObservable(ownerId).subscribe(function (entity) {
          vm.equipment = entity;
          widgetContext.rxjs
            .forkJoin([
              // Create the relation between selected room and the equipment asset.
              saveRelation(entity.id),
              // Setup equipment location based on the selected room's attributes.
              setupInitialEquipmentLocation(),
            ])
            .subscribe(function () {
              // Create a subscription to monitor equipment location changes.
              createLocationSubscription().subscribe(function () {
                vm.step = 2;
              });
            });
        });
      });
    };

    vm.back = function () {
      cancelLocationSubscription();
      vm.step = 1;
    };

    // Submit: finalize and close the dialog.
    vm.submit = function () {
      assignEquipment().subscribe(() => {
        cancelLocationSubscription();
        widgetContext.updateAliases();
        vm.dialogRef.close(null);
      });
    };

    // Create or update the equipment asset using the form values.
    function saveEntityObservable(ownerId) {
      return getOrCreateAssetGroup(ownerId).pipe(
        widgetContext.rxjs.switchMap((entityGroup) => {
          const formValues = vm.addEquipmentFormGroup.value;
          let equipment = {
            name: formValues.name,
            type: formValues.type,
            label: formValues.name,
            customerId: ownerId,
          };
          if (vm.equipment) {
            equipment.id = vm.equipment.id;
          }
          return assetService.saveAsset(equipment, entityGroup.id.id);
        })
      );
    }

    // If the asset was created and then the dialog is canceled, delete the asset.
    function deleteEntityObservable() {
      if (vm.equipment) {
        return assetService.deleteAsset(vm.equipment.id.id);
      } else {
        return widgetContext.rxjs.of(null);
      }
    }

    // Create a relation where the selected room becomes the parent ("from") and the equipment asset is the child ("to").
    function saveRelation(entityId) {
      let selectedRoom = vm.addEquipmentFormGroup.get("room").value;
      let relation = {
        type: "Contains",
        typeGroup: "COMMON",
        from: selectedRoom.id,
        to: entityId,
      };
      return entityRelationService.saveRelation(relation);
    }

    // assignEquipment now retrieves the room directly from the form control to avoid null values.
    function assignEquipment() {
      let selectedRoom = vm.addEquipmentFormGroup.get("room").value;
      let attributesArray = [
        {
          key: "roomXPos",
          value: vm.roomLocation.xPos,
        },
        {
          key: "roomYPos",
          value: vm.roomLocation.yPos,
        },
        {
          key: "room",
          value: selectedRoom.name,
        },
        {
          key: "zone",
          value: zoneName,
        },
      ];
      let newEquipmentRelation = {
        type: "Contains",
        typeGroup: "COMMON",
        from: selectedRoom.id,
        to: vm.equipment.id,
      };
      // Update the equipment label using the selected room and equipment type.
      vm.equipment.label =
        selectedRoom.name +
        " " +
        vm.equipmentTypes.find((type) => type.type === vm.equipment.type).name;
      return widgetContext.rxjs.forkJoin([
        assetService.saveAsset(vm.equipment),
        attributeService.saveEntityAttributes(
          vm.equipment.id,
          "SERVER_SCOPE",
          attributesArray
        ),
        entityRelationService.saveRelation(newEquipmentRelation),
      ]);
    }

    // Create a subscription to monitor the equipment’s location attributes.
    function createLocationSubscription() {
      let subscriptionInfo = {
        type: "entity",
        entityType: vm.equipment.id.entityType,
        entityId: vm.equipment.id.id,
        attributes: [
          {
            name: "xPos",
          },
          {
            name: "yPos",
          },
        ],
      };
      let options = {
        callbacks: {
          onDataUpdated: function (subscription) {
            checkHasLocation(subscription.data);
          },
        },
      };
      return widgetContext.subscriptionApi
        .createSubscriptionFromInfo(
          "latest",
          [subscriptionInfo],
          options,
          false,
          true
        )
        .pipe(
          widgetContext.rxjs.tap(function (locationSubscription) {
            vm.locationSubscription = locationSubscription;
          })
        );
    }

    // Update the flag once valid xPos and yPos are found.
    function checkHasLocation(data) {
      let hasLocation = false;
      if (data.length === 2) {
        let xPos, yPos;
        for (let i = 0; i < data.length; i++) {
          let datasourceData = data[i];
          if (datasourceData.dataKey.name === "xPos") {
            xPos = datasourceData.data[0][1];
          } else if (datasourceData.dataKey.name === "yPos") {
            yPos = datasourceData.data[0][1];
          }
        }
        if (isNumeric(xPos) && isNumeric(yPos)) {
          hasLocation = true;
        }
      }
      vm.hasLocation = hasLocation;
    }

    function isNumeric(val) {
      return (
        typeof val === "number" ||
        (typeof val === "string" && !isNaN(val) && !isNaN(parseFloat(val)))
      );
    }

    function cancelLocationSubscription() {
      if (vm.locationSubscription) {
        widgetContext.subscriptionApi.removeSubscription(
          vm.locationSubscription.id
        );
        vm.locationSubscription = null;
      }
    }

    // Copy the selected room's location (xPos, yPos) and save them as the equipment's initial location.
    function setupInitialEquipmentLocation() {
      let selectedRoom = vm.addEquipmentFormGroup.get("room").value;
      return attributeService
        .getEntityAttributes(selectedRoom.id, "SERVER_SCOPE", ["xPos", "yPos"])
        .pipe(
          widgetContext.rxjs.switchMap((attributes) => {
            vm.roomLocation.xPos = 0;
            vm.roomLocation.yPos = 0;
            for (let i = 0; i < attributes.length; i++) {
              if (attributes[i].key === "xPos") {
                vm.roomLocation.xPos = attributes[i].value;
              } else if (attributes[i].key === "yPos") {
                vm.roomLocation.yPos = attributes[i].value;
              }
            }
            let attributesArray = [
              {
                key: "xPos",
                value: vm.roomLocation.xPos,
              },
              {
                key: "yPos",
                value: vm.roomLocation.yPos,
              },
            ];
            return attributeService.saveEntityAttributes(
              vm.equipment.id,
              "SERVER_SCOPE",
              attributesArray
            );
          })
        );
    }

    function getOrCreateAssetGroup(ownerId) {
      return getEntityGroupByName(
        ownerId,
        "Quality Control Assets",
        "ASSET"
      ).pipe(
        widgetContext.rxjs.switchMap((group) => {
          if (group) {
            return widgetContext.rxjs.of(group);
          } else {
            var entityGroup = {
              type: "ASSET",
              name: "Quality Control Assets",
              ownerId: ownerId,
            };
            return entityGroupService.saveEntityGroup(entityGroup);
          }
        })
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
          { ignoreLoading: true }
        )
        .pipe(
          widgetContext.rxjs.map((data) => {
            if (data.data.length) {
              return data.data.find((group) => group.name === groupName);
            } else {
              return null;
            }
          })
        );
    }

    function getCustomerId() {
      const customerAliasId =
        widgetContext.aliasController.getEntityAliasId("Customer");
      return widgetContext.aliasController.getAliasInfo(customerAliasId).pipe(
        widgetContext.rxjs.map((info) => {
          return {
            id: info.currentEntity.id,
            entityType: info.currentEntity.entityType,
          };
        })
      );
    }
  }
}
