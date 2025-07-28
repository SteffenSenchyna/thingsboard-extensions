export function getDeviceMarker(data) {
  const type = data["Type"];
  const active = data["active"];
  const state = data["state"];

  const status = active === "false" ? "disconnected" : state;
  const color = getDeviceBackgroundColor(type, status);
  const icon = getDeviceMatIcon(type);

  const svg = `
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="15" cy="15" r="15" fill="${color}" />
      <text x="15" y="20" text-anchor="middle" fill="white" font-size="16" font-family="Material Icons">
        ${icon}
      </text>
    </svg>
  `;

  const encodedSvg = encodeURIComponent(svg);
  const svgUrl = `data:image/svg+xml,${encodedSvg}`;

  return {
    url: svgUrl,
    size: 30,
    markerOffset: [15, 15],
    tooltipOffset: [0, -15],
  };
}

function getDeviceMatIcon(type) {
  switch (type) {
    case "Freezer":
    case "Chiller":
      return "ac_unit";
    case "Smart Shelf":
      return "view_shelf";
    case "Smart Bin":
      return "delete";
    case "Door Sensor":
      return "sensor_door";
    case "Motion Sensor":
    case "Occupancy Sensor":
      return "sensors";
    case "Liquid Level Sensor":
      return "water_drop";
    case "Smoke Sensor":
      return "smoking_rooms";
    default:
      return "device_unknown";
  }
}

function getDeviceBackgroundColor(type, status) {
  switch (status) {
    case "major":
      return "#D5C21B";
    case "critical":
      return "#E64A19";
    case "disconnected":
      return "#CAC1D2";
    case "normal":
    default:
      switch (type) {
        case "Freezer":
        case "Chiller":
          return "#4A8AEC";
        default:
          return "#1F8B4D";
      }
  }
}
