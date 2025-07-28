export function getSmartRetailDeviceTooltip(data) {
  var content = '<div style="font-family: Roboto;">' + '<div style="font-size: 14px; font-weight: 500; padding-bottom: 8px;">${entityLabel}</div>';

  var deviceType = data["Type"];
  if (typeof deviceType !== undefined) {
    content += '<div style="font-size: 12px; font-weight: normal;">' + getInfoByDeviceType(deviceType) + "</div>";
  }
  content += "</div>";
  return content;

  function getInfoByDeviceType(type) {
    switch (type) {
      case "Smart Shelf":
        return "Weight: ${weight:1} Kg";
      case "Chiller":
      case "Freezer":
        return "Temperature: ${temperature:1} \u00B0C";
      case "Smart Bin":
        return "Fullness: ${level:0}%";
      case "Liquid Level Sensor":
        return "Liquid level: ${level:0}%";
      case "Door Sensor":
        var open = data["open"] === "true";
        return "State: " + (open ? "Open" : "Closed");
      case "Motion Sensor":
        var movement = data["movement"] === "true";
        return "Movement detection: " + (movement ? "Detected" : "None");
      case "Occupancy Sensor":
        var occupied = data["occupied"] === "true";
        return "State: " + (occupied ? "Occupied" : "Vacant");
      case "Smoke Sensor":
        var alarm = data["alarm"] === "true";
        return "Fire alarm: " + (alarm ? "Alarm" : "None");
      default:
        return "TODO";
    }
  }
}

export function getSmartRetailDeviceMarker(data, dsData) {
  var type = data["Type"];
  var active = data["active"];
  var state = data["state"];

  var selectedDevice = dsData.some((d) => d["selectedDevice"] === true && d.entityId === data.entityId);
  var selectedMode = dsData.some((d) => d["selectedDevice"] === true);

  var status = state;
  if (active === "false") {
    status = "disconnected";
  }

  var text = getDeviceText(type, status, data);

  var markerWidth = defaultMarkerWidth;

  var width = markerWidth + getTextWidth(text);

  var svgStr = getDeviceSvg(type, status, width, text, selectedDevice, selectedMode, selectedDevice);

  var encodedSvg = encodeURIComponent(svgStr);

  var svgUrl = "data:image/svg+xml," + encodedSvg;

  if (selectedDevice) {
    width += 8;
    markerWidth += 8;
  }

  return {
    url: svgUrl,
    size: width,
    markerOffset: [markerWidth / 2, markerWidth / 2],
    tooltipOffset: [width * 0.5 - markerWidth / 2, -(markerWidth / 2)],
  };
}

export function getSmartRetailDeviceCellIcon(type) {
  var typeSvg = getSmartRetailDeviceSvgIcon(type);
  var encodedTypeSvg = encodeURIComponent(typeSvg);
  var typeSvgUrl = "data:image/svg+xml," + encodedTypeSvg;

  return "<span>" + '<img style="vertical-align: middle;" class="mat-icon" src="' + typeSvgUrl + '">' + '<span style="vertical-align: middle; padding-left: 8px;">' + type + "</span>" + "</span>";
}

export function onSmartRetailDeviceMarkerClick(widgetContext, entityId) {
  var params = JSON.parse(JSON.stringify(widgetContext.stateController.getStateParams()));
  var selectedDevice = params["selectedDevice"];
  if (selectedDevice && selectedDevice.entityId.id === entityId.id) {
    params["selectedDevice"] = null;
  } else {
    params["selectedDevice"] = { entityId: entityId };
  }
  widgetContext.stateController.updateState(null, params);
}

export function getSupermarketMarker(data, dsData) {
  var state = data["state"];
  var selectedSupermarket = dsData.some((d) => d["selectedSupermarket"] === true && d.entityId === data.entityId);
  var selectedMode = dsData.some((d) => d["selectedSupermarket"] === true);

  var status = state;
  var width = 30;
  var svgStr = getSupermarketSvg(status, width, selectedSupermarket, selectedMode);
  var encodedSvg = encodeURIComponent(svgStr);
  var svgUrl = "data:image/svg+xml," + encodedSvg;

  if (selectedSupermarket) {
    width += 8;
  }

  return {
    url: svgUrl,
    size: width,
    markerOffset: [width / 2, width / 2],
    tooltipOffset: [width * 0.5 - width / 2, -(width / 2)],
  };
}

export function onSupermarketMarkerClick(widgetContext, entityId, entityName, entityLabel) {
  var params = widgetContext.stateController.getStateParams();
  var selectedSupermarket = params["selectedSupermarket"];
  if (selectedSupermarket && selectedSupermarket.entityId.id === entityId.id) {
    params["selectedSupermarket"] = null;
  } else {
    params["selectedSupermarket"] = { entityId: entityId, entityName: entityName, entityLabel: entityLabel };
  }
  widgetContext.stateController.updateState(null, params);
}

const defaultMarkerWidth = 30;

function getDeviceText(type, status, data) {
  switch (status) {
    case "disconnected":
      return "NO CONN";
    case "normal":
    default:
      switch (type) {
        case "Freezer":
        case "Chiller":
          var temperature = Number(data["temperature"]);
          return temperature + " \u00B0C";
        default:
          return "";
      }
      break;
  }
}

function getTextWidth(text) {
  var width = 0;
  for (var i = 0; i < text.length; i++) {
    var charWidth;
    var character = text.charAt(i);
    if (character === " ") {
      charWidth = 8;
    } else if (character === "-") {
      charWidth = 7;
    } else if (character === "\u00B0") {
      charWidth = 5;
    } else if (!isNaN(character * 1)) {
      charWidth = 9;
    } else {
      // Upper case
      if (character === character.toUpperCase()) {
        charWidth = 12;
        // Lower case
      } else {
        charWidth = 10;
      }
    }
    width += charWidth;
  }
  return width;
}

function getDeviceSvg(type, status, width, text, isSelected, selectedMode, selectedDevice) {
  var shape = getDeviceShape(type);
  var color = getDeviceBackgroundColor(type, status);
  var background = getDeviceBackground(color, width);
  var svgWidth = isSelected ? width + 8 : width;
  var svgHeight = isSelected ? 38 : 30;

  var opacity = selectedMode && !selectedDevice ? 0.4 : 1;

  var deviceSvg =
    '<svg opacity="' +
    opacity +
    '" width="' +
    svgWidth +
    '" height="' +
    svgHeight +
    '" viewBox="0 0 ' +
    svgWidth +
    " " +
    svgHeight +
    '" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    wrapIfSelected(background + shape, isSelected);
  if (status === "disconnected") {
    deviceSvg += wrapIfSelected(
      '<path d="M6.92896 21.728L21.0711 7.58589L22.4853 9.00011L8.34317 23.1422L6.92896 21.728Z" fill="' +
        color +
        '"/>' +
        '<path d="M7.10692 21.3171C6.81393 21.0241 6.81393 20.5491 7.10692 20.2561L20.1852 7.17788C20.4781 6.88489 20.9532 6.88489 21.2462 7.17788V7.17788C21.5392 7.47088 21.5392 7.94591 21.2462 8.2389L8.16794 21.3171C7.87495 21.6101 7.39991 21.6101 7.10692 21.3171V21.3171Z" fill="white"/>',
      isSelected
    );
  }
  if (text !== "") {
    var transform = isSelected ? "34 10" : "30 6";
    deviceSvg +=
      '<text transform="translate(' +
      transform +
      ')" fill="white" xml:space="preserve" style="white-space: pre" font-family="Roboto" font-size="15.4" font-weight="500" letter-spacing="0em"><tspan x="0.10664" y="14.2637">' +
      text +
      "</tspan></text>";
  }
  if (selectedDevice) {
    deviceSvg += getDeviceSelectionStroke(width);
  }
  deviceSvg += "</svg>";
  return deviceSvg;
}

function getSupermarketSvg(status, width, isSelected, selectedMode) {
  var shape =
    '<path d="m18.636 15.8c0.59978 0 1.1276-0.32788 1.3995-0.82369l2.8629-5.1901c0.29589-0.5278-0.08796-1.1836-0.69574-1.1836h-11.836l-0.75172-1.5994h-2.615v1.5994h1.5994l2.8789 6.0697-1.0796 1.9513c-0.58378 1.0716 0.18393 2.3751 1.3995 2.3751h9.5964v-1.5994h-9.5964l0.87967-1.5994zm-7.5092-5.5979h9.7164l-2.2072 3.9985h-5.6139zm0.67175 9.5964c-0.87967 0-1.5914 0.71973-1.5914 1.5994s0.71174 1.5994 1.5914 1.5994 1.5994-0.71973 1.5994-1.5994-0.71973-1.5994-1.5994-1.5994zm7.997 0c-0.87967 0-1.5914 0.71973-1.5914 1.5994s0.71174 1.5994 1.5914 1.5994c0.87967 0 1.5994-0.71973 1.5994-1.5994s-0.71973-1.5994-1.5994-1.5994z" fill="white" stroke-width=".7997"/>';
  var color = getSupermarketBackgroundColor(status);
  var background = getSupermarketBackground(color);
  var svgWidth = isSelected ? width + 8 : width;
  var svgHeight = isSelected ? 38 : 30;

  var opacity = selectedMode && !isSelected ? 0.4 : 1;

  var supermarketSvg =
    '<svg opacity="' +
    opacity +
    '" width="' +
    svgWidth +
    '" height="' +
    svgHeight +
    '" viewBox="0 0 ' +
    svgWidth +
    " " +
    svgHeight +
    '" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    wrapIfSelected(background + shape, isSelected);
  if (isSelected) {
    supermarketSvg += getSupermarketSelectionStroke();
  }
  supermarketSvg += "</svg>";
  return supermarketSvg;
}

function wrapIfSelected(svg, isSelected) {
  if (isSelected) {
    return '<g transform="translate(4 4)">' + svg + "</g>";
  } else {
    return svg;
  }
}

function getDeviceBackground(color, width) {
  if (width === 30) {
    return '<circle cx="15" cy="15" r="15" fill="' + color + '"/>';
  } else {
    return (
      '<circle cx="15" cy="15" r="15" fill="' +
      color +
      '"/>' +
      '<circle cx="' +
      (width - 15) +
      '" cy="15" r="15" fill="' +
      color +
      '"/>' +
      '<rect x="15" y="0" width="' +
      (width - 30) +
      '" height="30" rx="1" fill="' +
      color +
      '"/>'
    );
  }
}

function getDeviceSelectionStroke(width) {
  if (width === 30) {
    return '<circle cx="19" cy="19" r="18" stroke="#D5C21B" stroke-width="2"/>';
  } else {
    var rectWidth = width + 6;
    return '<rect x="1" y="1" width="' + rectWidth + '" height="36" rx="18" stroke="#D5C21B" stroke-width="2"/>';
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

function getSupermarketBackground(color) {
  return '<circle cx="15" cy="15" r="15" fill="' + color + '"/>';
}

function getSupermarketSelectionStroke() {
  return '<circle cx="19" cy="19" r="18" stroke="#D5C21B" stroke-width="2"/>';
}

function getSupermarketBackgroundColor(status) {
  switch (status) {
    case "major":
      return "#D5C21B";
    case "critical":
      return "#E64A19";
    case "normal":
    default:
      return "#1F8B4D";
  }
}

function getDeviceShape(type) {
  switch (type) {
    case "Smart Shelf":
      return '<path fill-rule="evenodd" clip-rule="evenodd" d="M7.5 7C7.22386 7 7 7.22386 7 7.5V22.5C7 22.7761 7.22386 23 7.5 23C7.77614 23 8 22.7761 8 22.5V22H22V22.5C22 22.7761 22.2239 23 22.5 23C22.7761 23 23 22.7761 23 22.5V7.5C23 7.22386 22.7761 7 22.5 7C22.2239 7 22 7.22386 22 7.5V13H19C19.5523 13 20 12.5523 20 12V9C20 8.44772 19.5523 8 19 8H16C15.4477 8 15 8.44772 15 9V12C15 12.5523 15.4477 13 16 13H12C12.5523 13 13 12.5523 13 12V11C13 10.4477 12.5523 10 12 10H11C10.4477 10 10 10.4477 10 11V12C10 12.5523 10.4477 13 11 13H8V7.5C8 7.22386 7.77614 7 7.5 7ZM22 21V14H8V21H11C10.4477 21 10 20.5523 10 20V17C10 16.4477 10.4477 16 11 16H14C14.5523 16 15 16.4477 15 17V20C15 20.5523 14.5523 21 14 21H17C16.4477 21 16 20.5523 16 20V18C16 17.4477 16.4477 17 17 17H19C19.5523 17 20 17.4477 20 18V20C20 20.5523 19.5523 21 19 21H22Z" fill="white"/>';
    case "Smart Bin":
      return (
        '<path d="M11.7185 19C10.1524 19 9.19394 17.2816 10.0169 15.9491L10.0982 15.8175C10.178 15.8327 10.2609 15.8383 10.3457 15.8332C10.897 15.8001 11.3171 15.3264 11.284 14.7751L11.2171 13.6591C11.1984 13.348 11.0357 13.0633 10.7771 12.8893C10.5186 12.7153 10.1936 12.6718 9.8984 12.7717L8.93237 13.0985C8.40921 13.2755 8.12858 13.8431 8.30556 14.3662C8.34237 14.475 8.39608 14.5734 8.46278 14.6593L8.31523 14.8982C6.66939 17.5631 8.58633 21 11.7185 21H12.8349C13.3871 21 13.8349 20.5523 13.8349 20C13.8349 19.4478 13.3871 19 12.8349 19L11.7185 19Z" fill="white"/>' +
        '<path d="M18.3135 18.8409C19.8789 18.8873 20.8879 17.198 20.1048 15.8418L19.5467 14.875C19.2705 14.3967 19.4344 13.7851 19.9127 13.5089C20.391 13.2328 21.0026 13.3967 21.2787 13.875L21.8369 14.8418C23.403 17.5543 21.3849 20.9329 18.2542 20.84L17.9735 20.8317C17.9324 20.9324 17.8741 21.0281 17.7983 21.1143C17.4337 21.5292 16.8019 21.5699 16.387 21.2054L15.621 20.5322C15.3869 20.3264 15.2621 20.0233 15.2835 19.7123C15.3049 19.4014 15.47 19.1182 15.7301 18.9465L16.6632 18.3305C17.124 18.0262 17.7444 18.1531 18.0487 18.614C18.0955 18.6849 18.1321 18.7596 18.1588 18.8363L18.3135 18.8409Z" fill="white"/>' +
        '<path d="M16.6696 10.21C15.9272 8.83113 13.9597 8.80195 13.1766 10.1582L12.6185 11.125C12.3423 11.6033 11.7307 11.7672 11.2524 11.491C10.7741 11.2149 10.6103 10.6033 10.8864 10.125L11.4446 9.15821C13.0107 6.44568 16.9456 6.50404 18.4306 9.26183L18.5637 9.50907C18.6715 9.49425 18.7835 9.4969 18.8961 9.51943C19.4377 9.62774 19.7889 10.1546 19.6806 10.6961L19.4806 11.6961C19.4195 12.0017 19.2193 12.2614 18.9393 12.3983C18.6594 12.5353 18.3315 12.5338 18.0528 12.3944L17.0528 11.8944C16.5588 11.6474 16.3586 11.0468 16.6056 10.5528C16.6436 10.4768 16.6899 10.4078 16.743 10.3462L16.6696 10.21Z" fill="white"/>'
      );
    case "Freezer":
      return (
        '<rect x="14" y="7" width="2" height="16" rx="1" fill="white"/>' +
        '<path d="M17.5 8.5L15 11L12.5 8.5M17.5 21.5L15 19L12.5 21.5" stroke="white" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M21.8792 13.9151L18.4641 13L19.3792 9.58496M10.6208 20.4151L11.5359 17L8.12082 16.085" stroke="white" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M10.6208 9.58491L11.5359 13L8.12085 13.915M21.8792 16.0849L18.4641 17L19.3792 20.415" stroke="white" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<rect x="21.4282" y="10.1338" width="2" height="16" rx="1" transform="rotate(60 21.4282 10.1338)" fill="white"/>' +
        '<rect x="7.57178" y="11.8662" width="2" height="16" rx="1" transform="rotate(-60 7.57178 11.8662)" fill="white"/>'
      );
    case "Chiller":
      return (
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M18.0001 12.4999C18.0001 13.5371 17.2661 14.2516 16.4454 14.6433C16.2807 14.7219 16.1185 14.7506 15.9657 14.7387C15.9881 14.822 16.0001 14.9096 16.0001 14.9999C16.0001 15.0304 15.9988 15.0605 15.9961 15.0902C16.1511 15.0322 16.322 14.9999 16.5001 14.9999L17.5001 14.9999L18.5 14.9999C19.3285 14.9999 20.0003 15.6975 19.6435 16.4452C19.2517 17.2658 18.5373 17.9999 17.5001 17.9999C16.4629 17.9999 15.7484 17.2658 15.3567 16.4452C15.2781 16.2805 15.2494 16.1184 15.2613 15.9655C15.178 15.988 15.0905 15.9999 15.0001 15.9999C14.9697 15.9999 14.9395 15.9986 14.9097 15.9959C14.9678 16.1509 15 16.3218 15 16.5L15 17.4999L15 18.4999C15.0001 19.3284 14.3025 20.0002 13.5548 19.6433C12.7341 19.2516 12.0001 18.5371 12.0001 17.4999C12.0001 16.4627 12.7341 15.7483 13.5548 15.3566C13.7195 15.278 13.8817 15.2493 14.0346 15.2611C14.0121 15.1779 14.0001 15.0903 14.0001 14.9999C14.0001 14.9695 14.0015 14.9394 14.0042 14.9096C13.8492 14.9677 13.6784 14.9999 13.5003 14.9999L12.5003 14.9999L11.5003 14.9999C10.6719 14.9999 10.0001 14.3023 10.3569 13.5547C10.7486 12.734 11.4631 11.9999 12.5003 11.9999C13.5375 11.9999 14.252 12.734 14.6437 13.5547C14.7223 13.7193 14.751 13.8815 14.7391 14.0343C14.8223 14.0119 14.9098 13.9999 15.0001 13.9999C15.0306 13.9999 15.0607 14.0013 15.0905 14.004C15.0324 13.849 15.0002 13.6781 15.0002 13.4999L15.0002 12.4999L15.0002 11.5C15.0001 10.6715 15.6977 9.99969 16.4454 10.3566C17.2661 10.7483 18.0001 11.4627 18.0001 12.4999Z" fill="white"/>' +
        '<circle cx="15" cy="15" r="8" stroke="white" stroke-width="2"/>'
      );
    case "Door Sensor":
      return (
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M19 9H11V21H19V9ZM13 17C13.5523 17 14 16.5523 14 16C14 15.4477 13.5523 15 13 15C12.4477 15 12 15.4477 12 16C12 16.5523 12.4477 17 13 17Z" fill="white"/>' +
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M21 22V8C21 7.44772 20.5523 7 20 7H10C9.44772 7 9 7.44772 9 8V22H8.5C8.22386 22 8 22.2239 8 22.5C8 22.7761 8.22386 23 8.5 23H21.5C21.7761 23 22 22.7761 22 22.5C22 22.2239 21.7761 22 21.5 22H21ZM20 8H10L10 22H20V8Z" fill="white"/>'
      );
    case "Liquid Level Sensor":
      return (
        '<path d="M19.6363 5.45321C19.8228 5.21026 20.1772 5.21026 20.3637 5.45321C20.9404 6.2044 22 7.73057 22 8.80373C22 10.0272 21.1143 10.9998 20 10.9998C18.8857 10.9998 18 10.0272 18 8.80373C18 7.73057 19.0596 6.2044 19.6363 5.45321Z" fill="white"/>' +
        '<path d="M13.3017 7.76073C13.6779 7.33798 14.3221 7.33798 14.6983 7.76073C16.2801 9.53832 20 14.0479 20 17.1437C20 20.4064 17.3427 23 14 23C10.6573 23 8 20.4064 8 17.1437C8 14.0479 11.7199 9.53832 13.3017 7.76073Z" fill="white"/>'
      );
    case "Motion Sensor":
      return (
        '<path d="M7.5 10C7.22386 10 7 10.2239 7 10.5C7 10.7761 7.22386 11 7.5 11H9C9 11.5523 9.44772 12 10 12H20C20.5523 12 21 11.5523 21 11H22.5C22.7761 11 23 10.7761 23 10.5C23 10.2239 22.7761 10 22.5 10H7.5Z" fill="white"/>' +
        '<path d="M17.0001 17C17.5524 17 18.0001 16.5523 18.0001 16C18.0001 15.4477 17.5524 15 17.0001 15C16.4478 15 16.0001 15.4477 16.0001 16C16.0001 16.5523 16.4478 17 17.0001 17Z" fill="white"/>' +
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M15.0001 21C19.0804 21 22.4472 17.9453 22.9384 13.998C23.0066 13.45 22.5524 13 22.0001 13H8.00009C7.4478 13 6.99353 13.45 7.06173 13.998C7.55295 17.9453 10.9198 21 15.0001 21ZM17.0001 18C18.1047 18 19.0001 17.1046 19.0001 16C19.0001 14.8954 18.1047 14 17.0001 14C15.8955 14 15.0001 14.8954 15.0001 16C15.0001 17.1046 15.8955 18 17.0001 18Z" fill="white"/>'
      );
    case "Occupancy Sensor":
      return (
        '<path d="M12 8.5C12 9.32843 11.3284 10 10.5 10C9.67157 10 9 9.32843 9 8.5C9 7.67157 9.67157 7 10.5 7C11.3284 7 12 7.67157 12 8.5Z" fill="white"/>' +
        '<path d="M10 22L10 19H11L11 22C11 22.5523 11.4477 23 12 23C12.5523 23 13 22.5523 13 22V17C13.5523 17 14 16.5523 14 16V12.8865C14 11.8446 13.1554 11 12.1135 11C12.0947 11 12.076 11.0005 12.0574 11.0016C12.0384 11.0005 12.0193 11 12 11L9 11C8.98072 11 8.96157 11.0005 8.94255 11.0016C8.92403 11.0005 8.90535 11 8.88652 11C7.84462 11 7 11.8446 7 12.8865V16C7 16.5523 7.44772 17 8 17V22C8 22.5523 8.44772 23 9 23C9.55229 23 10 22.5523 10 22Z" fill="white"/>' +
        '<path d="M21 23C20.4477 23 20 22.5523 20 22V19H19V22C19 22.5523 18.5523 23 18 23C17.4477 23 17 22.5523 17 22V19H15.7215C15.3724 19 15.1308 18.6513 15.2533 18.3244L17.4733 12.4045C17.7901 11.5597 18.5977 11 19.5 11C20.4023 11 21.2099 11.5597 21.5267 12.4045L23.7467 18.3244C23.8692 18.6513 23.6276 19 23.2785 19H22V22C22 22.5523 21.5523 23 21 23Z" fill="white"/>' +
        '<path d="M19.5 10C20.3284 10 21 9.32843 21 8.5C21 7.67157 20.3284 7 19.5 7C18.6716 7 18 7.67157 18 8.5C18 9.32843 18.6716 10 19.5 10Z" fill="white"/>'
      );
    case "Smoke Sensor":
      return '<path fill-rule="evenodd" clip-rule="evenodd" d="M14.6449 7.08319C14.4844 6.9888 14.2848 6.99138 14.1268 7.08988C13.9689 7.18839 13.8787 7.3665 13.8928 7.55213C13.9817 8.71876 13.788 9.5943 13.4536 10.3048C13.1161 11.0222 12.6221 11.6001 12.0639 12.157C11.884 12.3364 11.6901 12.5201 11.4921 12.7076C11.102 13.0772 10.6962 13.4616 10.3519 13.8572C9.81113 14.4785 9.35082 15.1982 9.15741 16.131C8.35478 20.0023 11.4395 23.1649 15.361 22.9822C15.41 22.9806 15.4592 22.9779 15.5088 22.9741L15.55 22.9708L15.5673 22.9695C15.6635 22.9622 15.7585 22.9532 15.8523 22.9427C15.897 22.9427 15.9422 22.9409 15.9878 22.9375C16.1369 22.9261 16.2735 22.9002 16.3976 22.8614C17.9028 22.5787 19.0571 21.8581 19.836 20.8302C20.7453 19.6303 21.1036 18.0646 20.9781 16.4151C20.7275 13.1215 18.5473 9.37866 14.6449 7.08319ZM17.1372 20.5326C17.1487 20.5269 17.1601 20.521 17.1714 20.5152C17.2227 20.2706 17.2393 20.0003 17.2172 19.7101C17.1353 18.6344 16.5243 17.3752 15.3912 16.4298C15.3443 16.6743 15.2711 16.8979 15.1767 17.1045C14.9725 17.5515 14.6812 17.8915 14.4045 18.1748C14.2918 18.2902 14.1897 18.3891 14.0946 18.4812C13.9367 18.6341 13.798 18.7684 13.6624 18.9284C13.4669 19.1591 13.3359 19.3839 13.2812 19.6575C13.209 20.018 13.2336 20.3634 13.336 20.6725C13.6953 20.8186 14.0884 20.9185 14.5095 20.9633C14.6266 20.764 14.7998 20.6036 14.9778 20.4389C15.3505 20.0938 15.7439 19.7297 15.6844 18.949C16.3929 19.3558 16.8813 19.938 17.1372 20.5326ZM18.2143 19.6343L18.2159 19.6563L18.2421 19.6222C18.7907 18.8983 19.0816 17.8503 18.9839 16.5668C18.8301 14.5445 17.7138 12.1546 15.6097 10.2554C15.5143 10.5702 15.3981 10.8699 15.2634 11.1563C14.781 12.1816 14.0987 12.9521 13.4765 13.5728C13.2089 13.8399 12.9769 14.0585 12.7661 14.2572C12.4306 14.5735 12.1485 14.8394 11.8606 15.1701C11.4574 15.6334 11.2168 16.0502 11.1159 16.537C10.8355 17.8894 11.2931 19.1616 12.2395 19.9971C12.2442 19.8222 12.2642 19.6432 12.3006 19.4613C12.3992 18.9687 12.6356 18.5933 12.8995 18.2819C13.0637 18.0882 13.2666 17.8908 13.4492 17.7131C13.5358 17.6288 13.6179 17.549 13.6891 17.4761C13.9335 17.2258 14.1329 16.9826 14.2671 16.689C14.3984 16.4016 14.4796 16.0379 14.4412 15.5337C14.427 15.347 14.5184 15.168 14.6779 15.0698C14.8374 14.9717 15.0384 14.971 15.1986 15.068C17.0451 16.1851 18.0906 18.0082 18.2143 19.6343Z" fill="white"/>';
    default:
      return "";
  }
}

export function getSmartRetailDeviceSvgIcon(type) {
  var typeSvg;
  switch (type) {
    case "Smart Shelf":
      typeSvg =
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M2.5 2C2.22386 2 2 2.22386 2 2.5V17.5C2 17.7761 2.22386 18 2.5 18C2.77614 18 3 17.7761 3 17.5V17H17V17.5C17 17.7761 17.2239 18 17.5 ' +
        "18C17.7761 18 18 17.7761 18 17.5V2.5C18 2.22386 17.7761 2 17.5 2C17.2239 2 17 2.22386 17 2.5V8H14C14.5523 8 15 7.55228 15 7V4C15 3.44772 14.5523 3 14 3H11C10.4477 3 10 3.44772 10 4V7C10 " +
        "7.55228 10.4477 8 11 8H7C7.55228 8 8 7.55228 8 7V6C8 5.44772 7.55228 5 7 5H6C5.44772 5 5 5.44772 5 6V7C5 7.55228 5.44772 8 6 8H3V2.5C3 2.22386 2.77614 2 2.5 2ZM17 16V9H3V16H6C5.44772 16 " +
        "5 15.5523 5 15V12C5 11.4477 5.44772 11 6 11H9C9.55228 11 10 11.4477 10 12V15C10 15.5523 9.55228 16 9 16H12C11.4477 16 11 15.5523 11 15V13C11 12.4477 11.4477 12 12 12H14C14.5523 12 15 " +
        '12.4477 15 13V15C15 15.5523 14.5523 16 14 16H17Z" fill="#212121"/>';
      break;
    case "Freezer":
      typeSvg =
        '<rect x="9" y="2" width="2" height="16" rx="1" fill="#212121"/>' +
        '<path d="M12.5 3.5L10 6L7.5 3.5M12.5 16.5L10 14L7.5 16.5" stroke="#212121" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M16.8792 8.91509L13.4641 8.00002L14.3792 4.58496M5.62082 15.4151L6.53588 12L3.12082 11.085" stroke="#212121" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M5.62085 4.58491L6.53591 7.99998L3.12085 8.91504M16.8792 11.0849L13.4641 12L14.3792 15.415" stroke="#212121" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<rect x="16.4282" y="5.13379" width="2" height="16" rx="1" transform="rotate(60 16.4282 5.13379)" fill="#212121"/>' +
        '<rect x="2.57178" y="6.86621" width="2" height="16" rx="1" transform="rotate(-60 2.57178 6.86621)" fill="#212121"/>';
      break;
    case "Chiller":
      typeSvg =
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M13.0001 7.49994C13.0001 8.53714 12.2661 9.2516 11.4454 9.64333C11.2807 9.72191 11.1185 9.75061 10.9657 9.73874C10.9881 9.82201 ' +
        "11.0001 9.90957 11.0001 9.99994C11.0001 10.0304 10.9988 10.0605 10.9961 10.0902C11.1511 10.0322 11.322 9.99993 11.5001 9.99993L12.5001 9.99994L13.5 9.99993C14.3285 9.99992 15.0003 " +
        "10.6975 14.6435 11.4452C14.2517 12.2658 13.5373 12.9999 12.5001 12.9999C11.4629 12.9999 10.7484 12.2658 10.3567 11.4452C10.2781 11.2805 10.2494 11.1184 10.2613 10.9655C10.178 10.988 " +
        "10.0905 10.9999 10.0001 10.9999C9.96965 10.9999 9.93949 10.9986 9.90971 10.9959C9.96779 11.1509 10 11.3218 10 11.5L10 12.4999L10 13.4999C10.0001 14.3284 9.30246 15.0002 8.55482 " +
        "14.6433C7.73413 14.2516 7.00006 13.5371 7.00006 12.4999C7.00006 11.4627 7.73413 10.7483 8.55482 10.3566C8.71948 10.278 8.8817 10.2493 9.03459 10.2611C9.01212 10.1779 9.00013 10.0903 " +
        "9.00013 9.99994C9.00013 9.9695 9.00149 9.93938 9.00416 9.90963C8.84921 9.96766 8.67837 9.9999 8.50029 9.99989L7.50031 9.99988L6.50033 9.99989C5.67189 9.9999 5.00006 9.3023 5.35692 " +
        "8.55467C5.74865 7.73397 6.46311 6.99991 7.50031 6.99991C8.5375 6.99991 9.25197 7.73397 9.6437 8.55467C9.72227 8.71929 9.75098 8.88149 9.73911 9.03435C9.82232 9.01191 9.90983 8.99994 " +
        "10.0001 8.99994C10.0306 8.99994 10.0607 9.0013 10.0905 9.00397C10.0324 8.84898 10.0002 8.67807 10.0002 8.49992L10.0002 7.49994L10.0002 6.49996C10.0001 5.67153 10.6977 4.99969 11.4454 " +
        '5.35655C12.2661 5.74828 13.0001 6.46274 13.0001 7.49994Z" fill="#212121"/>' +
        '<circle cx="10" cy="10" r="8" stroke="#212121" stroke-width="2"/>';
      break;
    case "Smart Bin":
      typeSvg =
        '<path d="M6.71849 14C5.15241 14 4.19394 12.2816 5.01686 10.9491L5.09816 10.8175C5.17797 10.8327 5.26094 10.8383 5.34575 10.8332C5.89704 10.8001 6.31713 10.3264 6.28404 9.77509L6.21705 8.65906C6.19838 8.34795 6.03571 8.06333 5.77714 7.88933C5.51856 7.71533 5.19363 7.67184 4.8984 7.77171L3.93237 8.09851C3.40921 8.27549 3.12858 8.84306 3.30556 9.36622C3.34237 9.47504 3.39608 9.57337 3.46278 9.65927L3.31523 9.89818C1.66939 12.5631 3.58633 16 6.71849 16H7.83485C8.38714 16 8.83485 15.5523 8.83485 15C8.83485 14.4478 8.38714 14 7.83485 14L6.71849 14Z" fill="#212121"/>' +
        '<path d="M13.3135 13.8409C14.8789 13.8873 15.8879 12.198 15.1048 10.8418L14.5467 9.87495C14.2705 9.39666 14.4344 8.78507 14.9127 8.50893C15.391 8.23279 16.0026 8.39666 16.2787 8.87495L16.8369 9.84175C18.403 12.5543 16.3849 15.9329 13.2542 15.84L12.9735 15.8317C12.9324 15.9324 12.8741 16.0281 12.7983 16.1143C12.4337 16.5292 11.8019 16.5699 11.387 16.2054L10.621 15.5322C10.3869 15.3264 10.2621 15.0233 10.2835 14.7123C10.3049 14.4014 10.47 14.1182 10.7301 13.9465L11.6632 13.3305C12.124 13.0262 12.7444 13.1531 13.0487 13.614C13.0955 13.6849 13.1321 13.7596 13.1588 13.8363L13.3135 13.8409Z" fill="#212121"/>' +
        '<path d="M11.6696 5.21002C10.9272 3.83113 8.95968 3.80195 8.17664 5.15821L7.61846 6.12501C7.34232 6.6033 6.73073 6.76718 6.25244 6.49104C5.77414 6.21489 5.61027 5.6033 5.88641 5.12501L6.44459 4.15821C8.01067 1.44568 11.9456 1.50404 13.4306 4.26183L13.5637 4.50907C13.6715 4.49425 13.7835 4.4969 13.8961 4.51943C14.4377 4.62774 14.7889 5.15457 14.6806 5.69613L14.4806 6.69613C14.4195 7.00175 14.2193 7.26139 13.9393 7.39833C13.6594 7.53526 13.3315 7.53382 13.0528 7.39444L12.0528 6.89444C11.5588 6.64745 11.3586 6.04678 11.6056 5.5528C11.6436 5.47681 11.6899 5.40777 11.743 5.34624L11.6696 5.21002Z" fill="#212121"/>';
      break;
    case "Door Sensor":
      typeSvg =
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M14 4H6V16H14V4ZM8 12C8.55228 12 9 11.5523 9 11C9 10.4477 8.55228 10 8 10C7.44772 10 7 10.4477 7 11C7 11.5523 7.44772 12 8 12Z" fill="#212121"/>' +
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M16 17V3C16 2.44772 15.5523 2 15 2H5C4.44772 2 4 2.44772 4 3V17H3.5C3.22386 17 3 17.2239 3 17.5C3 17.7761 3.22386 18 3.5 18H16.5C16.7761 18 17 17.7761 17 17.5C17 17.2239 16.7761 17 16.5 17H16ZM15 3H5L5 17H15V3Z" fill="#212121"/>';
      break;
    case "Liquid Level Sensor":
      typeSvg =
        '<path d="M14.6363 0.453212C14.8228 0.210257 15.1772 0.210257 15.3637 0.453213C15.9404 1.2044 17 2.73057 17 3.80373C17 5.02723 16.1143 5.99982 15 5.99982C13.8857 5.99982 13 5.02723 13 3.80373C13 2.73057 14.0596 1.2044 14.6363 0.453212Z" fill="#212121"/>' +
        '<path d="M8.3017 2.76073C8.67788 2.33798 9.32212 2.33798 9.6983 2.76073C11.2801 4.53832 15 9.0479 15 12.1437C15 15.4064 12.3427 18 9 18C5.65725 18 3 15.4064 3 12.1437C3 9.0479 6.71994 4.53832 8.3017 2.76073Z" fill="#212121"/>';
      break;
    case "Motion Sensor":
      typeSvg =
        '<path d="M2.5 5C2.22386 5 2 5.22386 2 5.5C2 5.77614 2.22386 6 2.5 6H4C4 6.55228 4.44772 7 5 7H15C15.5523 7 16 6.55228 16 6H17.5C17.7761 6 18 5.77614 18 5.5C18 5.22386 17.7761 5 17.5 5H2.5Z" fill="#212121"/>' +
        '<path d="M12.0001 12C12.5524 12 13.0001 11.5523 13.0001 11C13.0001 10.4477 12.5524 10 12.0001 10C11.4478 10 11.0001 10.4477 11.0001 11C11.0001 11.5523 11.4478 12 12.0001 12Z" fill="#212121"/>' +
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M10.0001 16C14.0804 16 17.4472 12.9453 17.9384 8.99801C18.0066 8.44996 17.5524 8 17.0001 8H3.00009C2.4478 8 1.99353 8.44996 2.06173 8.99801C2.55295 12.9453 5.91978 16 10.0001 16ZM12.0001 13C13.1047 13 14.0001 12.1046 14.0001 11C14.0001 9.89543 13.1047 9 12.0001 9C10.8955 9 10.0001 9.89543 10.0001 11C10.0001 12.1046 10.8955 13 12.0001 13Z" fill="#212121"/>';
      break;
    case "Occupancy Sensor":
      typeSvg =
        '<path d="M7 3.5C7 4.32843 6.32843 5 5.5 5C4.67157 5 4 4.32843 4 3.5C4 2.67157 4.67157 2 5.5 2C6.32843 2 7 2.67157 7 3.5Z" fill="#212121"/>' +
        '<path d="M3 12C2.44772 12 2 11.5523 2 11L2 7.88652C2 6.84462 2.84462 6 3.88652 6C3.90535 6 3.92403 6.00055 3.94255 6.00162C3.96157 6.00055 3.98072 6 4 6H7C7.01928 6 7.03843 6.00055 7.05745 6.00162C7.07597 6.00055 7.09465 6 7.11348 6C8.15538 6 9 6.84462 9 7.88652V11C9 11.5523 8.55229 12 8 12V17C8 17.5523 7.55228 18 7 18C6.44772 18 6 17.5523 6 17L6 14H5V17C5 17.5523 4.55228 18 4 18C3.44772 18 3 17.5523 3 17V12Z" fill="#212121"/>' +
        '<path d="M16 18C15.4477 18 15 17.5523 15 17V14H14V17C14 17.5523 13.5523 18 13 18C12.4477 18 12 17.5523 12 17V14H10.7215C10.3724 14 10.1308 13.6513 10.2533 13.3244L12.4733 7.40449C12.7901 6.55968 13.5977 6 14.5 6C15.4023 6 16.2099 6.55968 16.5267 7.40449L18.7467 13.3244C18.8692 13.6513 18.6276 14 18.2785 14H17V17C17 17.5523 16.5523 18 16 18Z" fill="#212121"/>' +
        '<path d="M14.5 5C15.3284 5 16 4.32843 16 3.5C16 2.67157 15.3284 2 14.5 2C13.6716 2 13 2.67157 13 3.5C13 4.32843 13.6716 5 14.5 5Z" fill="#212121"/>';
      break;
    case "Smoke Sensor":
      typeSvg =
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M9.64491 2.08319C9.48444 1.9888 9.28482 1.99138 9.12685 2.08988C8.96887 2.18839 8.87871 2.3665 8.89285 2.55213C8.98169 3.71876 8.78795 4.5943 8.45363 5.30483C8.11607 6.02225 7.62209 6.60008 7.06387 7.157C6.88401 7.33644 6.69008 7.52013 6.49214 7.70763C6.10197 8.07721 5.69618 8.46158 5.35189 8.85718C4.81113 9.47853 4.35082 10.1982 4.15741 11.131C3.35478 15.0023 6.43952 18.1649 10.361 17.9822C10.41 17.9806 10.4592 17.9779 10.5088 17.9741L10.55 17.9708L10.5673 17.9695C10.6635 17.9622 10.7585 17.9532 10.8523 17.9427C10.897 17.9427 10.9422 17.9409 10.9878 17.9375C11.1369 17.9261 11.2735 17.9002 11.3976 17.8614C12.9028 17.5787 14.0571 16.8581 14.836 15.8302C15.7453 14.6303 16.1036 13.0646 15.9781 11.4151C15.7275 8.1215 13.5473 4.37866 9.64491 2.08319ZM12.1372 15.5326C12.1487 15.5269 12.1601 15.521 12.1714 15.5152C12.2227 15.2706 12.2393 15.0003 12.2172 14.7101C12.1353 13.6344 11.5243 12.3752 10.3912 11.4298C10.3443 11.6743 10.2711 11.8979 10.1767 12.1045C9.97248 12.5515 9.68116 12.8915 9.40451 13.1748C9.2918 13.2902 9.1897 13.3891 9.09461 13.4812C8.93666 13.6341 8.79804 13.7684 8.66241 13.9284C8.46694 14.1591 8.33595 14.3839 8.28119 14.6575C8.20904 15.018 8.23357 15.3634 8.33595 15.6725C8.69526 15.8186 9.08844 15.9185 9.50948 15.9633C9.62655 15.764 9.79981 15.6036 9.97777 15.4389C10.3505 15.0938 10.7439 14.7297 10.6844 13.949C11.3929 14.3558 11.8813 14.938 12.1372 15.5326ZM13.2143 14.6343L13.2159 14.6563L13.2421 14.6222C13.7907 13.8983 14.0816 12.8503 13.9839 11.5668C13.8301 9.5445 12.7138 7.15459 10.6097 5.25541C10.5143 5.57021 10.3981 5.86993 10.2634 6.15628C9.78098 7.18157 9.09869 7.9521 8.47652 8.57282C8.20885 8.83986 7.97694 9.05847 7.76612 9.25719C7.43058 9.57348 7.14846 9.83941 6.86065 10.1701C6.45742 10.6334 6.21678 11.0502 6.11585 11.537C5.83546 12.8894 6.29313 14.1616 7.23945 14.9971C7.24423 14.8222 7.26422 14.6432 7.30064 14.4613C7.39921 13.9687 7.63564 13.5933 7.89951 13.2819C8.06367 13.0882 8.26661 12.8908 8.44919 12.7131C8.53584 12.6288 8.61792 12.549 8.68907 12.4761C8.93347 12.2258 9.13295 11.9826 9.26713 11.689C9.39844 11.4016 9.47964 11.0379 9.44124 10.5337C9.42702 10.347 9.51835 10.168 9.67788 10.0698C9.83741 9.97174 10.0384 9.97101 10.1986 10.068C12.0451 11.1851 13.0906 13.0082 13.2143 14.6343Z" fill="#212121"/>';
      break;
    default:
      typeSvg = '<circle cx="10" cy="10" r="10" fill="#AAAAAA"/>';
  }

  return '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">' + typeSvg + "</svg>";
}

// Smart retail admin

export function placeSupermarket(widgetContext, latitude, longitude) {
  let $injector = widgetContext.$scope.$injector;
  let customDialog = $injector.get(widgetContext.servicesMap.get("customDialog"));
  let assetService = $injector.get(widgetContext.servicesMap.get("assetService"));
  let entityGroupService = $injector.get(widgetContext.servicesMap.get("entityGroupService"));
  let attributeService = $injector.get(widgetContext.servicesMap.get("attributeService"));
  let entityRelationService = $injector.get(widgetContext.servicesMap.get("entityRelationService"));

  openAddSupermarketDialog();

  function openAddSupermarketDialog() {
    const addSupermarketHtmlTemplate =
      '<form #addEntityForm="ngForm" [formGroup]="addSupermarketFormGroup"\n' +
      '      (ngSubmit)="save()" class="add-entity-form" style="width: 350px;">\n' +
      '  <mat-toolbar class="flex flex-row" color="primary">\n' +
      "    <h2>Add supermarket</h2>\n" +
      '    <span class="flex-1"></span>\n' +
      '    <button mat-icon-button (click)="cancel()" type="button">\n' +
      '      <mat-icon class="material-icons">close</mat-icon>\n' +
      "    </button>\n" +
      "  </mat-toolbar>\n" +
      '  <mat-progress-bar color="warn" mode="indeterminate" *ngIf="isLoading$ | async">\n' +
      "  </mat-progress-bar>\n" +
      '  <div style="height: 4px;" *ngIf="!(isLoading$ | async)"></div>\n' +
      '  <div mat-dialog-content class="flex flex-col">\n' +
      '    <div class="flex flex-row gap-2 xs:flex-col xs:gap-0">\n' +
      '      <mat-form-field class="mat-block flex-1">\n' +
      "        <mat-label>Supermarket title</mat-label>\n" +
      '        <input matInput formControlName="name" required>\n' +
      "        <mat-error *ngIf=\"addSupermarketFormGroup.get('name').hasError('required')\">\n" +
      "          Supermarket title is required.\n" +
      "        </mat-error>\n" +
      "      </mat-form-field>\n" +
      "    </div>\n" +
      "  </div>\n" +
      '  <div mat-dialog-actions class="flex flex-row items-center justify-end">\n' +
      '    <button mat-button color="primary"\n' +
      '            type="button"\n' +
      '            [disabled]="(isLoading$ | async)"\n' +
      '            (click)="cancel()" cdkFocusInitial>\n' +
      "      Cancel\n" +
      "    </button>\n" +
      '    <button mat-button mat-raised-button color="primary"\n' +
      '            type="submit"\n' +
      '            [disabled]="(isLoading$ | async) || addSupermarketFormGroup.invalid || !addSupermarketFormGroup.dirty">\n' +
      "      Add supermarket\n" +
      "    </button>\n" +
      "  </div>\n" +
      "</form>";

    customDialog.customDialog(addSupermarketHtmlTemplate, AddSupermarketDialogController).subscribe();
  }

  function AddSupermarketDialogController(instance) {
    let vm = instance;

    vm.addSupermarketFormGroup = vm.fb.group({
      name: ["", [vm.validators.required]],
    });

    vm.cancel = function () {
      vm.dialogRef.close(null);
    };

    vm.save = function () {
      var customerId;
      if (widgetContext.currentUser.authority === "TENANT_ADMIN") {
        customerId = widgetContext.stateController.getStateParams().entityId;
      } else {
        customerId = { id: widgetContext.currentUser.customerId, entityType: "CUSTOMER" };
      }
      vm.addSupermarketFormGroup.markAsPristine();
      saveSupermarketObservable(customerId).subscribe(function (supermarket) {
        widgetContext.rxjs.forkJoin([saveCustomerToSupermarketRelation(customerId, supermarket.id), saveAttributes(supermarket.id)]).subscribe(function () {
          var params = widgetContext.stateController.getStateParams();
          var selectedSupermarket = params["selectedSupermarket"];
          params["selectedSupermarket"] = { entityId: supermarket.id, entityName: supermarket.name, entityLabel: "" };
          widgetContext.updateAliases();
          vm.dialogRef.close(null);
        });
      });
    };

    function saveSupermarketObservable(customerId) {
      return getSupermarketsGroup(customerId).pipe(
        widgetContext.rxjs.switchMap((supermarketsGroup) => {
          const formValues = vm.addSupermarketFormGroup.value;
          let supermarket = {
            name: formValues.name,
            type: "supermarket",
            customerId: customerId,
          };
          return assetService.saveAsset(supermarket, supermarketsGroup.id.id);
        })
      );
    }

    function getSupermarketsGroup(customerId) {
      return entityGroupService.getEntityGroupsByOwnerId(customerId.entityType, customerId.id, "ASSET").pipe(
        widgetContext.rxjs.switchMap((entityGroups) => {
          var supermarketsGroup = entityGroups.find((group) => group.name === "Supermarkets");
          if (supermarketsGroup) {
            return widgetContext.rxjs.of(supermarketsGroup);
          } else {
            supermarketsGroup = {
              type: "ASSET",
              name: "Supermarkets",
              ownerId: customerId,
            };
            return entityGroupService.saveEntityGroup(supermarketsGroup);
          }
        })
      );
    }

    function saveCustomerToSupermarketRelation(customerId, supermarketId) {
      var relation = {
        from: customerId,
        to: supermarketId,
        typeGroup: "COMMON",
        type: "Owns",
      };
      return entityRelationService.saveRelation(relation);
    }

    function saveAttributes(entityId) {
      let attributesArray = [
        {
          key: "latitude",
          value: latitude,
        },
        {
          key: "longitude",
          value: longitude,
        },
        {
          key: "address",
          value: "N/A",
        },
        {
          key: "state",
          value: "normal",
        },
        {
          key: "floorplan",
          value: defaultSupermarketPlan,
        },
      ];
      return attributeService.saveEntityAttributes(entityId, "SERVER_SCOPE", attributesArray);
    }
  }
}

export function deleteSupermarket(widgetContext, entityId, entityName) {
  var $injector = widgetContext.$scope.$injector;
  var dialogs = $injector.get(widgetContext.servicesMap.get("dialogs"));
  var assetService = $injector.get(widgetContext.servicesMap.get("assetService"));
  var entityRelationService = $injector.get(widgetContext.servicesMap.get("entityRelationService"));
  var entityGroupService = $injector.get(widgetContext.servicesMap.get("entityGroupService"));
  let attributeService = $injector.get(widgetContext.servicesMap.get("attributeService"));

  openDeleteSupermarketDialog();

  function openDeleteSupermarketDialog() {
    var title = "Are you sure you want to delete the supermarket " + entityName + "?";
    var content = "Be careful, after the confirmation, the supermarket will be deleted and all related devices will be unassigned!";
    dialogs.confirm(title, content, "Cancel", "Delete").subscribe(function (result) {
      if (result) {
        deleteSupermarket();
      }
    });
  }

  function deleteSupermarket() {
    var customerId;
    if (widgetContext.currentUser.authority === "TENANT_ADMIN") {
      customerId = widgetContext.stateController.getStateParams().entityId;
    } else {
      customerId = { id: widgetContext.currentUser.customerId, entityType: "CUSTOMER" };
    }
    var relatedDevicesQuery = {
      parameters: {
        rootId: entityId.id,
        rootType: entityId.entityType,
        direction: "FROM",
      },
      filters: [{ relationType: "Contains", entityTypes: ["DEVICE"] }],
    };
    entityRelationService.findByQuery(relatedDevicesQuery).subscribe((relatedDevicesRelations) => {
      var removeDevicesObservable;
      if (relatedDevicesRelations.length) {
        removeDevicesObservable = getUnassignedDevicesGroup(customerId).pipe(
          widgetContext.rxjs.switchMap((unassignedDevicesGroup) => {
            var removeDevicesObservables = [];
            relatedDevicesRelations.forEach((deviceRelation) => {
              removeDevicesObservables.push(removeDevice(deviceRelation.to, customerId, unassignedDevicesGroup.id.id));
            });
            return widgetContext.rxjs.forkJoin(removeDevicesObservables);
          })
        );
      } else {
        removeDevicesObservable = widgetContext.rxjs.of(null);
      }
      removeDevicesObservable.subscribe(() => {
        assetService.deleteAsset(entityId.id).subscribe(function () {
          widgetContext.updateAliases();
        });
      });
    });
  }

  function removeDevice(deviceId, customerId, unassignedDevicesGroupId) {
    return widgetContext.rxjs.forkJoin([
      entityGroupService.addEntityToEntityGroup(unassignedDevicesGroupId, deviceId.id),
      deleteSupermarketToDeviceRelation(deviceId),
      removePositionAttributes(deviceId),
    ]);
  }

  function getUnassignedDevicesGroup(customerId) {
    return entityGroupService.getEntityGroupsByOwnerId(customerId.entityType, customerId.id, "DEVICE").pipe(
      widgetContext.rxjs.switchMap((deviceEntityGroups) => {
        return getOrCreateUnassignedDevicesGroup(customerId, deviceEntityGroups);
      })
    );
  }

  function getOrCreateUnassignedDevicesGroup(customerId, groups) {
    var unassignedDevicesGroup = groups.find((group) => group.name === "Unassigned Supermarket Devices");
    if (unassignedDevicesGroup) {
      return widgetContext.rxjs.of(unassignedDevicesGroup);
    } else {
      unassignedDevicesGroup = {
        type: "DEVICE",
        name: "Unassigned Supermarket Devices",
        ownerId: customerId,
      };
      return entityGroupService.saveEntityGroup(unassignedDevicesGroup);
    }
  }

  function deleteSupermarketToDeviceRelation(deviceId) {
    return entityRelationService.deleteRelation(entityId, "Contains", deviceId);
  }

  function removePositionAttributes(entityId) {
    return attributeService.deleteEntityAttributes(entityId, "SERVER_SCOPE", [{ key: "xPos" }, { key: "yPos" }]);
  }
}

export function placeSmartRetailDevice(widgetContext, xPos, yPos) {
  let $injector = widgetContext.$scope.$injector;
  let customDialog = $injector.get(widgetContext.servicesMap.get("customDialog"));
  let entityService = $injector.get(widgetContext.servicesMap.get("entityService"));
  let deviceService = $injector.get(widgetContext.servicesMap.get("deviceService"));
  let entityGroupService = $injector.get(widgetContext.servicesMap.get("entityGroupService"));
  let attributeService = $injector.get(widgetContext.servicesMap.get("attributeService"));
  let entityRelationService = $injector.get(widgetContext.servicesMap.get("entityRelationService"));

  openAddDeviceDialog();

  function openAddDeviceDialog() {
    const addDeviceHtmlTemplate =
      '<form #addEntityForm="ngForm" [formGroup]="addDeviceFormGroup"\n' +
      '      (ngSubmit)="save()" class="add-entity-form" style="width: 350px;">\n' +
      '  <mat-toolbar class="flex flex-row" color="primary">\n' +
      "    <h2>Add device</h2>\n" +
      '    <span class="flex-1"></span>\n' +
      '    <button mat-icon-button (click)="cancel()" type="button">\n' +
      '      <mat-icon class="material-icons">close</mat-icon>\n' +
      "    </button>\n" +
      "  </mat-toolbar>\n" +
      '  <mat-progress-bar color="warn" mode="indeterminate" *ngIf="isLoading$ | async">\n' +
      "  </mat-progress-bar>\n" +
      '  <div style="height: 4px;" *ngIf="!(isLoading$ | async)"></div>\n' +
      '  <div mat-dialog-content class="flex flex-col">\n' +
      '    <mat-form-field class="mat-block">\n' +
      "      <mat-label>Device</mat-label>\n" +
      '      <mat-select formControlName="device" required>\n' +
      "        <mat-select-trigger>\n" +
      '          <div class="device-item flex flex-row">\n' +
      '            <div class="flex flex-1 flex-col">\n' +
      "              <div>{{addDeviceFormGroup.get('device').value?.label}}</div>\n" +
      "              <div class=\"device-name\">{{addDeviceFormGroup.get('device').value?.name}}</div>\n" +
      "            </div>\n" +
      "            <div class=\"device-type\">{{addDeviceFormGroup.get('device').value?.type}}</div>\n" +
      "          </div>\n" +
      "        </mat-select-trigger>\n" +
      '        <mat-option *ngFor="let device of availableDevices" [value]="device">\n' +
      '          <div class="device-item flex flex-row">\n' +
      '            <div class="flex flex-1 flex-col">\n' +
      "              <div>{{device?.label}}</div>\n" +
      '              <div class="device-name">{{device?.name}}</div>\n' +
      "            </div>\n" +
      '            <div class="device-type">{{device?.type}}</div>\n' +
      "          </div>\n" +
      "          <mat-divider></mat-divider>\n" +
      "        </mat-option>\n" +
      '        <mat-option *ngIf="!availableDevices?.length" disabled [value]="null">\n' +
      '          <div class="device-item">\n' +
      "            No devices available\n" +
      "          </div>\n" +
      "        </mat-option>\n" +
      "      </mat-select>\n" +
      "      <mat-error *ngIf=\"addDeviceFormGroup.get('device').hasError('required')\">\n" +
      "        Device is required.\n" +
      "      </mat-error>\n" +
      "    </mat-form-field>\n" +
      '    <mat-form-field class="mat-block">\n' +
      "      <mat-label>Label</mat-label>\n" +
      '      <input matInput formControlName="label" required>\n' +
      "      <mat-error *ngIf=\"addDeviceFormGroup.get('label').hasError('required')\">\n" +
      "        Device label is required.\n" +
      "      </mat-error>\n" +
      "    </mat-form-field>\n" +
      "  </div>\n" +
      '  <div mat-dialog-actions class="flex flex-row items-center justify-end">\n' +
      '    <button mat-button color="primary"\n' +
      '            type="button"\n' +
      '            [disabled]="(isLoading$ | async)"\n' +
      '            (click)="cancel()" cdkFocusInitial>\n' +
      "      Cancel\n" +
      "    </button>\n" +
      '    <button mat-button mat-raised-button color="primary"\n' +
      '            type="submit"\n' +
      '            [disabled]="(isLoading$ | async) || addDeviceFormGroup.invalid || !addDeviceFormGroup.dirty">\n' +
      "      Add device\n" +
      "    </button>\n" +
      "  </div>\n" +
      "</form>\n";

    const addDeviceDialogCss =
      ".device-item {\n" +
      "    line-height: 24px;\n" +
      "    width: 100%;\n" +
      "    padding-top: 8px;\n" +
      "    padding-bottom: 8px;\n" +
      "}\n" +
      "\n" +
      ".device-item .device-name {\n" +
      "    font-size: 12px;\n" +
      "    opacity: 0.7;\n" +
      "}\n" +
      "\n" +
      ".device-item .device-type {\n" +
      "    font-size: 14px;\n" +
      "    opacity: 0.7;\n" +
      "}\n" +
      "\n" +
      ".mat-mdc-option {\n" +
      "    height: auto !important;\n" +
      "    white-space: normal !important;\n" +
      "}\n" +
      "\n" +
      ".mat-mdc-option .mdc-list-item__primary-text {\n" +
      "    display: block;\n" +
      "    width: 100%;\n" +
      "}";

    const cssParser = new cssjs();
    cssParser.testMode = false;
    cssParser.cssPreviewNamespace = "add-smart-retail-device-dialog";
    cssParser.createStyleElement("add-smart-retail-device-dialog", addDeviceDialogCss, "nonamespace");

    customDialog.customDialog(addDeviceHtmlTemplate, AddDeviceDialogController).subscribe();
  }

  function AddDeviceDialogController(instance) {
    let vm = instance;

    vm.addDeviceFormGroup = vm.fb.group({
      device: [null, [vm.validators.required]],
      label: [{ value: null, disabled: true }, [vm.validators.required]],
    });

    vm.addDeviceFormGroup.get("device").valueChanges.subscribe((device) => {
      vm.addDeviceFormGroup.get("label").patchValue(device.label, { emitEvent: false });
      vm.addDeviceFormGroup.get("label").enable({ emitEvent: false });
      vm.addDeviceFormGroup.get("label").updateValueAndValidity({ onlySelf: true });
    });

    vm.cancel = function () {
      vm.dialogRef.close(null);
    };

    vm.save = function () {
      var supermarketId = widgetContext.stateController.getStateParams().selectedSupermarket.entityId;
      vm.addDeviceFormGroup.markAsPristine();
      var device = vm.addDeviceFormGroup.value.device;
      var label = vm.addDeviceFormGroup.value.label;
      var deviceId = device.deviceId;
      widgetContext.rxjs
        .forkJoin([
          entityGroupService.removeEntityFromEntityGroup(vm.unassignedDevicesGroup.id.id, deviceId.id),
          saveDeviceToSupermarketRelation(supermarketId, deviceId),
          saveAttributes(deviceId),
          updateDeviceLabel(device, label),
        ])
        .subscribe(() => {
          widgetContext.updateAliases();
          vm.dialogRef.close(null);
        });
    };

    init();

    function init() {
      vm.unassignedDevicesGroup = null;
      vm.availableDevices = [];
      if (widgetContext.currentUser.authority === "TENANT_ADMIN") {
        vm.customerId = widgetContext.stateController.getStateParams().entityId;
      } else {
        vm.customerId = { id: widgetContext.currentUser.customerId, entityType: "CUSTOMER" };
      }
      entityGroupService.getEntityGroupsByOwnerId(vm.customerId.entityType, vm.customerId.id, "DEVICE").subscribe((entityGroups) => {
        vm.customerDevicesGroups = entityGroups;
        vm.unassignedDevicesGroup = entityGroups.find((group) => group.name === "Unassigned Supermarket Devices");
        if (vm.unassignedDevicesGroup) {
          var query = {
            entityFilter: {
              type: "entityGroup",
              groupType: "DEVICE",
              entityGroup: vm.unassignedDevicesGroup.id.id,
            },
            pageLink: {
              pageSize: 100,
              page: 0,
            },
            entityFields: [
              {
                key: "name",
                type: "ENTITY_FIELD",
              },
              {
                key: "type",
                type: "ENTITY_FIELD",
              },
              {
                key: "label",
                type: "ENTITY_FIELD",
              },
            ],
          };
          entityService.findEntityDataByQuery(query).subscribe((data) => {
            vm.availableDevices = data.data.map((entityData) => {
              return {
                deviceId: entityData.entityId,
                name: entityData.latest["ENTITY_FIELD"].name.value,
                type: entityData.latest["ENTITY_FIELD"].type.value,
                label: entityData.latest["ENTITY_FIELD"].label.value,
              };
            });
          });
        }
      });
    }

    function saveDeviceToSupermarketRelation(supermarketId, deviceId) {
      var relation = {
        from: supermarketId,
        to: deviceId,
        typeGroup: "COMMON",
        type: "Contains",
      };
      return entityRelationService.saveRelation(relation);
    }

    function saveAttributes(entityId) {
      let attributesArray = [
        {
          key: "xPos",
          value: xPos,
        },
        {
          key: "yPos",
          value: yPos,
        },
      ];
      return attributeService.saveEntityAttributes(entityId, "SERVER_SCOPE", attributesArray);
    }

    function updateDeviceLabel(device, label) {
      if (device.label !== label) {
        return deviceService.getDevice(device.deviceId.id).pipe(
          widgetContext.rxjs.switchMap((origDevice) => {
            origDevice.label = label;
            return deviceService.saveDevice(origDevice);
          })
        );
      } else {
        return widgetContext.rxjs.of(null);
      }
    }
  }
}

export function deleteSmartRetailDevice(widgetContext, entityId, entityName) {
  var $injector = widgetContext.$scope.$injector;
  var dialogs = $injector.get(widgetContext.servicesMap.get("dialogs"));
  var entityRelationService = $injector.get(widgetContext.servicesMap.get("entityRelationService"));
  var entityGroupService = $injector.get(widgetContext.servicesMap.get("entityGroupService"));
  let attributeService = $injector.get(widgetContext.servicesMap.get("attributeService"));

  openRemoveDeviceDialog();

  function openRemoveDeviceDialog() {
    var title = "Are you sure you want to remove the device " + entityName + "?";
    var content = "After the confirmation, the device will be unassigned from the current supermarket!";
    dialogs.confirm(title, content, "Cancel", "Remove from supermarket").subscribe(function (result) {
      if (result) {
        doRemoveDevice();
      }
    });
  }

  function doRemoveDevice() {
    var customerId;
    if (widgetContext.currentUser.authority === "TENANT_ADMIN") {
      customerId = widgetContext.stateController.getStateParams().entityId;
    } else {
      customerId = { id: widgetContext.currentUser.customerId, entityType: "CUSTOMER" };
    }
    var supermarketId = widgetContext.stateController.getStateParams().selectedSupermarket.entityId;
    removeDevice(entityId, supermarketId, customerId).subscribe(() => {
      widgetContext.updateAliases();
    });
  }

  function removeDevice(deviceId, supermarketId, customerId) {
    return getUnassignedDevicesGroup(customerId).pipe(
      widgetContext.rxjs.switchMap((unassignedDevicesGroup) => {
        return widgetContext.rxjs.forkJoin([
          entityGroupService.addEntityToEntityGroup(unassignedDevicesGroup.id.id, deviceId.id),
          deleteSupermarketToDeviceRelation(supermarketId, deviceId),
          removePositionAttributes(deviceId),
        ]);
      })
    );
  }

  function getUnassignedDevicesGroup(customerId) {
    return entityGroupService.getEntityGroupsByOwnerId(customerId.entityType, customerId.id, "DEVICE").pipe(
      widgetContext.rxjs.switchMap((deviceEntityGroups) => {
        return getOrCreateUnassignedDevicesGroup(customerId, deviceEntityGroups);
      })
    );
  }

  function getOrCreateUnassignedDevicesGroup(customerId, groups) {
    var unassignedDevicesGroup = groups.find((group) => group.name === "Unassigned Supermarket Devices");
    if (unassignedDevicesGroup) {
      return widgetContext.rxjs.of(unassignedDevicesGroup);
    } else {
      unassignedDevicesGroup = {
        type: "DEVICE",
        name: "Unassigned Supermarket Devices",
        ownerId: customerId,
      };
      return entityGroupService.saveEntityGroup(unassignedDevicesGroup);
    }
  }

  function deleteSupermarketToDeviceRelation(supermarketId, deviceId) {
    return entityRelationService.deleteRelation(supermarketId, "Contains", deviceId);
  }

  function removePositionAttributes(deviceId) {
    return attributeService.deleteEntityAttributes(deviceId, "SERVER_SCOPE", [{ key: "xPos" }, { key: "yPos" }]);
  }
}

export function updateSmartRetailDeviceLabel(widgetContext, entityId) {
  let $injector = widgetContext.$scope.$injector;
  let customDialog = $injector.get(widgetContext.servicesMap.get("customDialog"));
  let deviceService = $injector.get(widgetContext.servicesMap.get("deviceService"));

  openEditDeviceDialog();

  function openEditDeviceDialog() {
    const editDeviceHtmlTemplate =
      '<form #addEntityForm="ngForm" [formGroup]="editDeviceFormGroup"\n' +
      '      (ngSubmit)="save()" class="add-entity-form" style="width: 350px;">\n' +
      '  <mat-toolbar class="flex flex-row" color="primary">\n' +
      "    <h2>Update label</h2>\n" +
      '    <span class="flex-1"></span>\n' +
      '    <button mat-icon-button (click)="cancel()" type="button">\n' +
      '      <mat-icon class="material-icons">close</mat-icon>\n' +
      "    </button>\n" +
      "  </mat-toolbar>\n" +
      '  <mat-progress-bar color="warn" mode="indeterminate" *ngIf="isLoading$ | async">\n' +
      "  </mat-progress-bar>\n" +
      '  <div style="height: 4px;" *ngIf="!(isLoading$ | async)"></div>\n' +
      '  <div mat-dialog-content class="flex flex-col">\n' +
      '    <mat-form-field class="mat-block">\n' +
      "      <mat-label>New label</mat-label>\n" +
      '      <input matInput formControlName="label" required>\n' +
      "      <mat-error *ngIf=\"editDeviceFormGroup.get('label').hasError('required')\">\n" +
      "        Device label is required.\n" +
      "      </mat-error>\n" +
      "    </mat-form-field>\n" +
      "  </div>\n" +
      '  <div mat-dialog-actions class="flex flex-row items-center justify-end">\n' +
      '    <button mat-button color="primary"\n' +
      '            type="button"\n' +
      '            [disabled]="(isLoading$ | async)"\n' +
      '            (click)="cancel()" cdkFocusInitial>\n' +
      "      Cancel\n" +
      "    </button>\n" +
      '    <button mat-button mat-raised-button color="primary"\n' +
      '            type="submit"\n' +
      '            [disabled]="(isLoading$ | async) || editDeviceFormGroup.invalid || !editDeviceFormGroup.dirty">\n' +
      "      Update label\n" +
      "    </button>\n" +
      "  </div>\n" +
      "</form>\n";

    customDialog.customDialog(editDeviceHtmlTemplate, EditDeviceDialogController).subscribe();
  }

  function EditDeviceDialogController(instance) {
    let vm = instance;

    vm.device = {};

    vm.editDeviceFormGroup = vm.fb.group({
      label: ["", [vm.validators.required]],
    });

    getDevice();

    vm.cancel = function () {
      vm.dialogRef.close(null);
    };

    vm.save = function () {
      vm.editDeviceFormGroup.markAsPristine();
      saveDevice().subscribe(function () {
        widgetContext.updateAliases();
        vm.dialogRef.close(null);
      });
    };

    function getDevice() {
      deviceService.getDevice(entityId.id).subscribe(function (device) {
        vm.device = device;
        vm.editDeviceFormGroup.patchValue(
          {
            label: vm.device.label,
          },
          { emitEvent: false }
        );
      });
    }

    function saveDevice() {
      const formValues = vm.editDeviceFormGroup.value;
      vm.device.label = formValues.label;
      return deviceService.saveDevice(vm.device);
    }
  }
}

const defaultSupermarketPlan =
  "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPCEtLSBDcmVhdGVkIHdpdGggSW5rc2NhcGUgKGh0dHA6Ly93d3cuaW5rc2NhcGUub3JnLykgLS0+Cjxzdmcgd2lkdGg9IjMwMCIgaGVpZ2h0PSIzMDAiIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDc5LjM3NSA3OS4zNzUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiA8cmVjdCB4PSIyLjcwMTkiIHk9IjIuNzAxOSIgd2lkdGg9IjczLjk3MSIgaGVpZ2h0PSI3My45NzEiIGZpbGw9IiNmZmYiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9Ii4xMTIxIiBzdHlsZT0icGFpbnQtb3JkZXI6bWFya2VycyBmaWxsIHN0cm9rZSIvPgogPGcgdHJhbnNmb3JtPSJtYXRyaXgoLjI2NDU4IDAgMCAuMjY0NTggMi42MzUgLTIuODgzNCkiIHN0cm9rZS13aWR0aD0iMXB4IiBzdHlsZT0ic2hhcGUtaW5zaWRlOnVybCgjcmVjdDQ4MzYpO3doaXRlLXNwYWNlOnByZSIgYXJpYS1sYWJlbD0iICAgTm8gcGxhbiBjb25maWd1cmVkIj4KICA8cGF0aCBkPSJtMTAxLjY3IDExOC4yOXYyOC40MzhoLTMuNzg5MWwtMTQuMzE2LTIxLjkzNHYyMS45MzRoLTMuNzY5NXYtMjguNDM4aDMuNzY5NWwxNC4zNzUgMjEuOTkydi0yMS45OTJ6Ii8+CiAgPHBhdGggZD0ibTEwNi44MyAxMzUuOTVxMC00LjU4OTggMi41NzgxLTcuNjU2MiAyLjU3ODEtMy4wODU5IDcuMDExNy0zLjA4NTl0Ny4wMTE3IDMuMDI3M3EyLjU3ODEgMy4wMDc4IDIuNjM2NyA3LjUxOTV2MC42NDQ1M3EwIDQuNTg5OC0yLjU5NzcgNy42NTYyLTIuNTc4MSAzLjA2NjQtNy4wMTE3IDMuMDY2NC00LjQ1MzEgMC03LjA1MDgtMy4wNjY0LTIuNTc4MS0zLjA2NjQtMi41NzgxLTcuNjU2MnptMy42MTMzIDAuNDQ5MjJxMCAzLjE0NDUgMS40ODQ0IDUuNDQ5MiAxLjUwMzkgMi4zMDQ3IDQuNTMxMiAyLjMwNDcgMi45NDkyIDAgNC40NTMxLTIuMjY1NiAxLjUwMzktMi4yODUyIDEuNTIzNC01LjQyOTd2LTAuNTA3ODFxMC0zLjEwNTUtMS41MDM5LTUuNDI5Ny0xLjUwMzktMi4zNDM4LTQuNTExNy0yLjM0MzgtMi45ODgzIDAtNC40OTIyIDIuMzQzOC0xLjQ4NDQgMi4zMjQyLTEuNDg0NCA1LjQyOTd6Ii8+CiAgPHBhdGggZD0ibTE1MC4xNyAxNDcuMTJxLTMuODA4NiAwLTYuMDM1Mi0yLjQ0MTR2MTAuMTc2aC0zLjYzMjh2LTI5LjI1OGgzLjMyMDNsMC4xNzU3OCAyLjMyNDJxMi4yMjY2LTIuNzE0OCA2LjExMzMtMi43MTQ4IDQuMDAzOSAwIDYuMTMyOCAyLjk2ODggMi4xMjg5IDIuOTY4OCAyLjEyODkgNy44MTI1djAuNDEwMTZxMCA0LjYyODktMi4xNDg0IDcuNjc1OC0yLjEyODkgMy4wNDY5LTYuMDU0NyAzLjA0Njl6bS0xLjExMzMtMTguODY3cS0zLjI4MTIgMC00LjkyMTkgMi45MTAydjEwLjExN3ExLjY2MDIgMi44NzExIDQuOTYwOSAyLjg3MTEgMi45Mjk3IDAgNC4yNzczLTIuMzA0NyAxLjM2NzItMi4zMDQ3IDEuMzY3Mi01LjQ0OTJ2LTAuNDEwMTZxMC0zLjE0NDUtMS4zNjcyLTUuNDI5Ny0xLjM0NzYtMi4zMDQ3LTQuMzE2NC0yLjMwNDd6Ii8+CiAgPHBhdGggZD0ibTE2Ni45MSAxMTYuNzN2MzBoLTMuNjMyOHYtMzB6Ii8+CiAgPHBhdGggZD0ibTE4NS43NSAxNDYuNzNxLTAuMzUxNTctMC43NjE3Mi0wLjUwNzgyLTIuMjI2Ni0xLjAxNTYgMS4wNzQyLTIuNTM5MSAxLjg1NTUtMS41MjM0IDAuNzYxNzItMy40NzY2IDAuNzYxNzItMy4yNDIyIDAtNS4xOTUzLTEuODE2NC0xLjk1MzEtMS44MTY0LTEuOTUzMS00LjQ1MzEgMC0zLjM5ODQgMi41NzgxLTUuMTU2MiAyLjU3ODEtMS43NzczIDYuOTMzNi0xLjc3NzNoMy41NzQydi0xLjY3OTdxMC0xLjg3NS0xLjEzMjgtMi45ODgzLTEuMTEzMy0xLjEzMjgtMy4zMjAzLTEuMTMyOC0yLjA1MDggMC0zLjMyMDMgMS4wMTU2LTEuMjUgMC45OTYxLTEuMjUgMi4zMjQyaC0zLjYxMzNxMC0yLjI2NTYgMi4yODUyLTQuMjU3OCAyLjI4NTItMS45OTIyIDYuMTEzMy0xLjk5MjIgMy40Mzc1IDAgNS42NDQ1IDEuNzU3OCAyLjIwNyAxLjc1NzggMi4yMDcgNS4zMTI1djkuNDkyMnEwIDIuOTI5NyAwLjc0MjE5IDQuNjQ4NHYwLjMxMjV6bS01Ljk5NjEtMi43NzM0cTEuOTUzMSAwIDMuMzc4OS0wLjk3NjU2IDEuNDQ1My0wLjk3NjU2IDIuMDMxMi0yLjE2OHYtNC4zNTU1aC0zLjM1OTRxLTYuMDkzOCAwLjExNzE5LTYuMDkzOCAzLjkwNjIgMCAxLjUwMzkgMS4wMTU2IDIuNTU4NiAxLjAxNTYgMS4wMzUyIDMuMDI3MyAxLjAzNTJ6Ii8+CiAgPHBhdGggZD0ibTIwMy4yMyAxMjguMjVxLTEuNzM4MyAwLTMuMDY2NCAwLjkzNzUtMS4zMjgxIDAuOTM3NS0yLjA4OTggMi40NDE0djE1LjA5OGgtMy42MTMzdi0yMS4xMzNoMy40MThsMC4xMTcxOSAyLjYzNjdxMi40MDIzLTMuMDI3MyA2LjMwODYtMy4wMjczIDMuMTA1NSAwIDQuOTIxOSAxLjczODMgMS44MzU5IDEuNzM4MyAxLjg1NTUgNS44Mzk4djEzLjk0NWgtMy42MzI4di0xMy44ODdxMC0yLjQ4MDUtMS4wOTM4LTMuNTM1Mi0xLjA3NDItMS4wNTQ3LTMuMTI1LTEuMDU0N3oiLz4KICA8cGF0aCBkPSJtNTcuOTQxIDE5NC4xNXExLjkzMzYgMCAzLjM3ODktMS4xNTIzIDEuNDY0OC0xLjE1MjMgMS42MDE2LTIuOTQ5MmgzLjQzNzVxLTAuMTM2NzIgMi44MzItMi41OTc3IDQuOTYwOS0yLjQ2MDkgMi4xMDk0LTUuODIwMyAyLjEwOTQtNC43NjU2IDAtNy4wODk4LTMuMTQ0NS0yLjMwNDctMy4xNDQ1LTIuMzA0Ny03LjQwMjN2LTAuODIwMzFxMC00LjI1NzggMi4zMDQ3LTcuNDAyNCAyLjMyNDItMy4xNDQ1IDcuMDg5OC0zLjE0NDUgMy43MTA5IDAgNS45OTYxIDIuMjA3IDIuMjg1MiAyLjE4NzUgMi40MjE5IDUuNDQ5MmgtMy40Mzc1cS0wLjEzNjcyLTEuOTUzMS0xLjQ4NDQtMy4zMjAzLTEuMzI4MS0xLjM2NzItMy40OTYxLTEuMzY3Mi0yLjIyNjYgMC0zLjQ5NjEgMS4xMzI4LTEuMjUgMS4xMzI4LTEuNzc3MyAyLjg3MTEtMC41MDc4MSAxLjczODMtMC41MDc4MSAzLjU3NDJ2MC44MjAzMXEwIDEuODU1NSAwLjUwNzgxIDMuNTkzOCAwLjUwNzgxIDEuNzM4MyAxLjc1NzggMi44NzExIDEuMjY5NSAxLjExMzMgMy41MTU2IDEuMTEzM3oiLz4KICA8cGF0aCBkPSJtNjkuNDY1IDE4NS45NXEwLTQuNTg5OCAyLjU3ODEtNy42NTYyIDIuNTc4MS0zLjA4NTkgNy4wMTE3LTMuMDg1OSA0LjQzMzYgMCA3LjAxMTcgMy4wMjczIDIuNTc4MSAzLjAwNzggMi42MzY3IDcuNTE5NXYwLjY0NDUzcTAgNC41ODk4LTIuNTk3NyA3LjY1NjItMi41NzgxIDMuMDY2NC03LjAxMTcgMy4wNjY0LTQuNDUzMSAwLTcuMDUwOC0zLjA2NjQtMi41NzgxLTMuMDY2NC0yLjU3ODEtNy42NTYyem0zLjYxMzMgMC40NDkyMnEwIDMuMTQ0NSAxLjQ4NDQgNS40NDkyIDEuNTAzOSAyLjMwNDcgNC41MzEyIDIuMzA0NyAyLjk0OTIgMCA0LjQ1MzEtMi4yNjU2IDEuNTAzOS0yLjI4NTIgMS41MjM0LTUuNDI5N3YtMC41MDc4MXEwLTMuMTA1NS0xLjUwMzktNS40Mjk3LTEuNTAzOS0yLjM0MzgtNC41MTE3LTIuMzQzOC0yLjk4ODMgMC00LjQ5MjIgMi4zNDM4LTEuNDg0NCAyLjMyNDItMS40ODQ0IDUuNDI5N3oiLz4KICA8cGF0aCBkPSJtMTAyIDE3OC4yNXEtMS43MzgzIDAtMy4wNjY0IDAuOTM3NS0xLjMyODEgMC45Mzc1LTIuMDg5OCAyLjQ0MTR2MTUuMDk4aC0zLjYxMzN2LTIxLjEzM2gzLjQxOGwwLjExNzE5IDIuNjM2N3EyLjQwMjMtMy4wMjczIDYuMzA4Ni0zLjAyNzMgMy4xMDU1IDAgNC45MjE5IDEuNzM4MyAxLjgzNTkgMS43MzgzIDEuODU1NSA1LjgzOTh2MTMuOTQ1aC0zLjYzMjh2LTEzLjg4N3EwLTIuNDgwNS0xLjA5MzgtMy41MzUyLTEuMDc0Mi0xLjA1NDctMy4xMjUtMS4wNTQ3eiIvPgogIDxwYXRoIGQ9Im0xMjQuNDYgMTc4LjM3aC00LjMxNjR2MTguMzU5aC0zLjYxMzN2LTE4LjM1OWgtMy4zMzk4di0yLjc3MzRoMy4zMzk4di0xLjgzNTlxMC0zLjU5MzggMi4wNzAzLTUuNTA3OCAyLjA3MDMtMS45MzM2IDUuNjY0MS0xLjkzMzYgMi4xODc1IDAgNS41MjczIDEuMTkxNGwtMC42MDU0NiAzLjA0NjlxLTIuNTM5MS0wLjk5NjA5LTQuNjY4LTAuOTk2MDktMi4zMjQyIDAtMy4zNTk0IDEuMDU0Ny0xLjAxNTYgMS4wMzUyLTEuMDE1NiAzLjE0NDV2MS44MzU5aDQuMzE2NHptNy4xMDk0LTIuNzczNHYyMS4xMzNoLTMuNjEzM3YtMjEuMTMzeiIvPgogIDxwYXRoIGQ9Im0xNDUuNTIgMjA1LjA3cS0xLjY0MDYgMC00LjAyMzQtMC44MDA3OC0yLjM4MjgtMC44MDA3OC0zLjgwODYtMi44NzExbDEuODk0NS0yLjE0ODRxMi4zNDM4IDIuODUxNiA1LjY2NDEgMi44NTE2IDIuNTU4NiAwIDQuMDgyLTEuNDQ1MyAxLjUyMzQtMS40MjU4IDEuNTIzNC00LjE5OTJ2LTEuODU1NXEtMi4xNDg0IDIuNTE5NS01LjkxOCAyLjUxOTUtMy44MDg2IDAtNi4wNTQ3LTMuMDQ2OS0yLjI0NjEtMy4wNDY5LTIuMjQ2MS03LjY3NTh2LTAuNDEwMTZxMC00Ljg0MzggMi4yMjY2LTcuODEyNSAyLjI0NjEtMi45Njg4IDYuMTEzMy0yLjk2ODggMy44ODY3IDAgNi4wMzUyIDIuNzM0NGwwLjE3NTc4LTIuMzQzOGgzLjI4MTJ2MjAuNjg0cTAgNC4xOTkyLTIuNSA2LjQ4NDQtMi41IDIuMzA0Ny02LjQ0NTMgMi4zMDQ3em0tNS4yNzM0LTE4LjY3MnEwIDMuMTQ0NSAxLjMwODYgNS40MTAyIDEuMzI4MSAyLjI0NjEgNC4yNTc4IDIuMjQ2MSAzLjQzNzUgMCA1LjAzOTEtMy4xMjV2LTkuNjI4OXEtMC42ODM1OS0xLjMwODYtMS44OTQ1LTIuMTY4LTEuMjEwOS0wLjg3ODktMy4xMDU1LTAuODc4OS0yLjk0OTIgMC00LjI3NzMgMi4zMDQ3LTEuMzI4MSAyLjI4NTItMS4zMjgxIDUuNDI5N3oiLz4KICA8cGF0aCBkPSJtMTczLjA2IDE5Ni43My0wLjA3ODEtMi4wODk4cS0yLjA3MDMgMi40ODA1LTYuMTcxOSAyLjQ4MDUtMy4xMDU1IDAtNS4wMTk1LTEuODM1OS0xLjkxNDEtMS44MzU5LTEuOTE0MS02LjA1NDd2LTEzLjYzM2gzLjYxMzN2MTMuNjcycTAgMi44NTE2IDEuMTkxNCAzLjgyODEgMS4yMTA5IDAuOTU3MDMgMi42OTUzIDAuOTU3MDMgNC4wODIgMCA1LjUwNzgtMy4wNjY0di0xNS4zOTFoMy42MzI4djIxLjEzM3oiLz4KICA8cGF0aCBkPSJtMTkwLjQ0IDE3OC42OHEtMy41MzUyIDAtNC44MjQyIDMuMDQ2OXYxNWgtMy42MTMzdi0yMS4xMzNoMy41MTU2bDAuMDc4MSAyLjQyMTlxMS43MzgzLTIuODEyNSA1LjAxOTUtMi44MTI1IDEuMDE1NiAwIDEuNjAxNiAwLjI3MzQ0bC0wLjAxOTUgMy4zNTk0cS0wLjgwMDc4LTAuMTU2MjUtMS43NTc4LTAuMTU2MjV6Ii8+CiAgPHBhdGggZD0ibTIxMS45MSAxOTMuMDRxLTEuMDM1MiAxLjU2MjUtMi45Mjk3IDIuODMyLTEuODk0NSAxLjI1LTUuMDE5NSAxLjI1LTQuNDE0MSAwLTcuMDcwMy0yLjg3MTEtMi42MzY3LTIuODcxMS0yLjYzNjctNy4zNDM4di0wLjgyMDMxcTAtMy40NTcgMS4zMDg2LTUuODc4OSAxLjMyODEtMi40NDE0IDMuNDM3NS0zLjcxMDkgMi4xMDk0LTEuMjg5MSA0LjQ5MjItMS4yODkxIDQuNTMxMiAwIDYuNjAxNiAyLjk2ODggMi4wODk4IDIuOTQ5MiAyLjA4OTggNy4zODI4djEuNjIxMWgtMTQuMjk3cTAuMDc4MSAyLjkxMDIgMS43MTg4IDQuOTYwOSAxLjY2MDIgMi4wMzEyIDQuNTUwOCAyLjAzMTIgMS45MTQxIDAgMy4yNDIyLTAuNzgxMjUgMS4zMjgxLTAuNzgxMjUgMi4zMjQyLTIuMDg5OHptLTguNDE4LTE0Ljg2M3EtMi4xNDg0IDAtMy42MzI4IDEuNTYyNS0xLjQ4NDQgMS41NjI1LTEuODU1NSA0LjQ5MjJoMTAuNTY2di0wLjI3MzQ0cS0wLjEzNjcyLTIuMTA5NC0xLjIzMDUtMy45NDUzLTEuMDc0Mi0xLjgzNTktMy44NDc3LTEuODM1OXoiLz4KICA8cGF0aCBkPSJtMjMwLjAzIDE5Ni43My0wLjE3NTc4LTIuMjY1NnEtMi4xNjggMi42NTYyLTYuMDM1MiAyLjY1NjItMy43MTA5IDAtNS45OTYxLTMuMDA3OC0yLjI4NTItMy4wMDc4LTIuMzI0Mi03LjU1ODZ2LTAuNTY2NDFxMC00Ljg0MzggMi4yODUyLTcuODEyNSAyLjMwNDctMi45Njg4IDYuMDc0Mi0yLjk2ODggMy43MzA1IDAgNS44NTk0IDIuNXYtMTAuOTc3aDMuNjMyOHYzMHptLTEwLjg5OC0xMC4zMzJxMCAzLjE0NDUgMS4zMjgxIDUuNDEwMiAxLjMyODEgMi4yNDYxIDQuMjU3OCAyLjI0NjEgMy4zNTk0IDAgNS0zLjA2NjR2LTkuNzI2NnEtMS42MjExLTMuMDA3OC00Ljk2MDktMy4wMDc4LTIuOTQ5MiAwLTQuMjk2OSAyLjMwNDctMS4zMjgxIDIuMjg1Mi0xLjMyODEgNS40Mjk3eiIvPgogPC9nPgo8L3N2Zz4K";
