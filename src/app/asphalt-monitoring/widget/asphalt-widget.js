self.onInit = function () {};

self.onDataUpdated = function () {
  // forwards to the component's onDataUpdated via ctx.$scope
  if (self.ctx.$scope.asphaltDashboardComponent) {
    self.ctx.$scope.asphaltDashboardComponent.onDataUpdated();
  }
};

self.onResize = function () {
  if (self.ctx.$scope.asphaltDashboardComponent) {
    self.ctx.$scope.asphaltDashboardComponent.onResize();
  }
};

self.onDestroy = function () {};
