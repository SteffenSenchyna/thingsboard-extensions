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
  let deviceService = $injector.get(
    widgetContext.servicesMap.get("deviceService")
  );
  let entityService = $injector.get(
    widgetContext.servicesMap.get("entityService")
  );
  let entityRelationService = $injector.get(
    widgetContext.servicesMap.get("entityRelationService")
  );
  let entityGroupService = $injector.get(
    widgetContext.servicesMap.get("entityGroupService")
  );
  let attributeService = $injector.get(
    widgetContext.servicesMap.get("attributeService")
  );

  let zoneId = widgetContext.stateController.getStateParams()["zone"].entityId;
  let zoneName =
    widgetContext.stateController.getStateParams()["zone"].entityName;

  openAddDeviceDialog();

  function openAddDeviceDialog() {
    customDialog
      .customDialog(htmlTemplate, AddDeviceDialogController)
      .subscribe();
  }

  function AddDeviceDialogController(instance) {
    let vm = instance;

    vm.deviceTypes = [
      { name: "Gateway", type: "AL_Gateway" },
      { name: "Room sensor", type: "AL_RoomSensor" },
      { name: "Door sensor", type: "AL_DoorSensor" },
      { name: "Window sensor", type: "AL_WindowSensor" },
      { name: "Leak sensor", type: "AL_LeakSensor" },
      { name: "Smoke sensor", type: "AL_SmokeSensor" },
    ];

    vm.widgetContext = widgetContext;
    vm.step = 1;

    vm.device = null;
    vm.room = null;
    vm.roomLocation = {};

    vm.hasLocation = false;
    vm.locationSubscription = null;

    vm.addDeviceFormGroup = vm.fb.group({
      type: [null, [vm.validators.required]],
      device: [null, [vm.validators.required]],
      room: [null, [vm.validators.required]],
    });

    vm.devices$ = vm.addDeviceFormGroup.get("type").valueChanges.pipe(
      widgetContext.rxjs.tap(() => {
        vm.addDeviceFormGroup.get("device").patchValue(null);
      }),
      widgetContext.rxjs.startWith(0),
      widgetContext.rxjs.map(() => vm.addDeviceFormGroup.get("type").value),
      widgetContext.rxjs.distinctUntilChanged(),
      widgetContext.rxjs.switchMap((type) => {
        if (type) {
          return getAvailableDevices(type);
        } else {
          return widgetContext.rxjs.of([]);
        }
      }),
      widgetContext.rxjs.share()
    );

    var roomsQuery = {
      parameters: {
        rootId: zoneId.id,
        rootType: zoneId.entityType,
        direction: "FROM",
        maxLevel: 1,
      },
      relationType: "Contains",
      assetTypes: ["AL_Room"],
    };

    vm.rooms$ = assetService
      .findByQuery(roomsQuery)
      .pipe(widgetContext.rxjs.share());

    vm.entityComparisonFunction = function (option, value) {
      if (!option || !value) {
        return option === value;
      } else {
        return option.id.id === value.id.id;
      }
    };

    vm.cancel = function () {
      cancelLocationSubscription();
      vm.dialogRef.close(null);
    };

    vm.next = function () {
      vm.addDeviceFormGroup.markAsPristine();
      const formValues = vm.addDeviceFormGroup.value;
      vm.room = formValues.room;
      const selectedDevice = formValues.device;
      deviceService.getDevice(selectedDevice.id.id).subscribe((device) => {
        vm.device = device;
        setupInitialDeviceLocation().subscribe(() => {
          createLocationSubscription().subscribe(() => {
            vm.step = 2;
          });
        });
      });
    };

    vm.back = function () {
      cancelLocationSubscription();
      vm.step = 1;
    };

    vm.submit = function () {
      assignDevice().subscribe(() => {
        cancelLocationSubscription();
        widgetContext.updateAliases();
        vm.dialogRef.close(null);
      });
    };

    function createLocationSubscription() {
      var subscriptionInfo = {
        type: "entity",
        entityType: vm.device.id.entityType,
        entityId: vm.device.id.id,
        attributes: [{ name: "xPos" }, { name: "yPos" }],
      };
      var options = {
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

    function checkHasLocation(data) {
      var hasLocation = false;
      if (data.length === 2) {
        var xPos, yPos;
        for (var i = 0; i < data.length; i++) {
          var datasourceData = data[i];
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
      if (typeof val === "number") {
        return true;
      } else if (typeof val === "string") {
        return !isNaN(val) && !isNaN(parseFloat(val));
      } else {
        return false;
      }
    }

    function cancelLocationSubscription() {
      if (vm.locationSubscription) {
        widgetContext.subscriptionApi.removeSubscription(
          vm.locationSubscription.id
        );
        vm.locationSubscription = null;
      }
    }

    function setupInitialDeviceLocation() {
      return attributeService
        .getEntityAttributes(vm.room.id, "SERVER_SCOPE", ["xPos", "yPos"])
        .pipe(
          widgetContext.rxjs.switchMap((attributes) => {
            vm.roomLocation.xPos = 0;
            vm.roomLocation.yPos = 0;
            for (var i = 0; i < attributes.length; i++) {
              if (attributes[i].key === "xPos") {
                vm.roomLocation.xPos = attributes[i].value;
              } else if (attributes[i].key === "yPos") {
                vm.roomLocation.yPos = attributes[i].value;
              }
            }
            let attributesArray = [
              { key: "xPos", value: vm.roomLocation.xPos },
              { key: "yPos", value: vm.roomLocation.yPos },
            ];
            return attributeService.saveEntityAttributes(
              vm.device.id,
              "SERVER_SCOPE",
              attributesArray
            );
          })
        );
    }

    function assignDevice() {
      let attributesArray = [
        { key: "roomXPos", value: vm.roomLocation.xPos },
        { key: "roomYPos", value: vm.roomLocation.yPos },
        { key: "room", value: vm.room.name },
        { key: "zone", value: zoneName },
      ];
      let newDeviceRelation = {
        type: "Contains",
        typeGroup: "COMMON",
        from: vm.room.id,
        to: vm.device.id,
      };
      return getAssignedUnassignedDeviceGroupIds().pipe(
        widgetContext.rxjs.switchMap((groupIds) => {
          vm.device.label =
            vm.room.name +
            " " +
            vm.deviceTypes.filter((type) => type.type === vm.device.type)[0]
              .name;
          return widgetContext.rxjs.forkJoin([
            deviceService.saveDevice(vm.device),
            attributeService.saveEntityAttributes(
              vm.device.id,
              "SERVER_SCOPE",
              attributesArray
            ),
            entityRelationService.saveRelation(newDeviceRelation),
            entityGroupService.removeEntityFromEntityGroup(
              groupIds.unassignedGroupId,
              vm.device.id.id
            ),
            entityGroupService.addEntityToEntityGroup(
              groupIds.assignedGroupId,
              vm.device.id.id
            ),
          ]);
        })
      );
    }

    function getAssignedUnassignedDeviceGroupIds() {
      return getCustomerId().pipe(
        widgetContext.rxjs.switchMap((ownerId) => {
          return widgetContext.rxjs
            .forkJoin([
              getOrCreateEntityGroup(ownerId, "DEVICE", "Unassigned Devices"),
              getOrCreateEntityGroup(ownerId, "DEVICE", "Assigned Devices"),
            ])
            .pipe(
              widgetContext.rxjs.map((groups) => {
                return {
                  unassignedGroupId: groups[0].id.id,
                  assignedGroupId: groups[1].id.id,
                };
              })
            );
        })
      );
    }

    function getAvailableDevices(type) {
      return getCustomerId().pipe(
        widgetContext.rxjs.switchMap((ownerId) => {
          const query = {
            pageLink: {
              pageSize: 100,
              page: 0,
            },
            entityFields: [
              {
                type: "ENTITY_FIELD",
                key: "name",
              },
            ],
            entityFilter: {
              type: "entitiesByGroupName",
              groupType: "DEVICE",
              ownerId: ownerId,
              entityGroupNameFilter: "Unassigned Devices",
            },
            keyFilters: [
              {
                key: {
                  type: "ENTITY_FIELD",
                  key: "type",
                },
                valueType: "STRING",
                predicate: {
                  type: "STRING",
                  operation: "EQUAL",
                  value: { defaultValue: type },
                  ignoreCase: false,
                },
              },
            ],
          };
          return entityService.findEntityDataByQuery(query).pipe(
            widgetContext.rxjs.map((pageData) => {
              const devices = convertEntityPageDataToNameIdPairs(pageData);
              devices.sort((d1, d2) => d1.name.localeCompare(d2.name));
              return devices;
            })
          );
        })
      );
    }

    function convertEntityPageDataToNameIdPairs(pageData) {
      return pageData.data.map((entityData) => {
        return convertEntityDataToNameIdPair(entityData);
      });
    }

    function convertEntityDataToNameIdPair(entityData) {
      return {
        id: entityData.entityId,
        name: entityData.latest["ENTITY_FIELD"]["name"].value,
      };
    }

    function getOrCreateEntityGroup(ownerId, type, name) {
      return getEntityGroupByName(ownerId, name, type).pipe(
        widgetContext.rxjs.switchMap((group) => {
          if (group) {
            return widgetContext.rxjs.of(group);
          } else {
            var newGroup = {
              type: type,
              name: name,
              ownerId: ownerId,
            };
            return entityGroupService.saveEntityGroup(newGroup);
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
