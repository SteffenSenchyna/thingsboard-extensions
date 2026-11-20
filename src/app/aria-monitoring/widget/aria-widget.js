self.onInit = function () {};

self.onDataUpdated = function () {
  // forwards to the component's onDataUpdated via ctx.$scope
  if (self.ctx.$scope.ariaDashboardComponent) {
    self.ctx.$scope.ariaDashboardComponent.onDataUpdated();
  }
};

self.onResize = function () {
  if (self.ctx.$scope.ariaDashboardComponent) {
    self.ctx.$scope.ariaDashboardComponent.onResize();
  }
};

self.onDestroy = function () {};
