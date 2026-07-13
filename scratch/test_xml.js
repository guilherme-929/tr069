const { XMLBuilder } = require('fast-xml-parser');

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  suppressEmptyNode: true,
});

function buildSoapResponse(action, body) {
  return {
    'soap:Envelope': {
      '@_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
      '@_xmlns:cwmp': 'urn:dslforum-org:cwmp-1-0',
      '@_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@_xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
      '@_soap:encodingStyle': 'http://schemas.xmlsoap.org/soap/encoding/',
      'soap:Header': {
        'cwmp:ID': { '@_soap:mustUnderstand': '1', '#text': '12345' },
      },
      'soap:Body': {
        [`cwmp:${action}`]: body,
      },
    },
  };
}

const names = [
  "Device.WiFi.SSID.16.Stats.BytesSent",
  "Device.WiFi.SSID.16.Stats.BytesReceived"
];

const xml = builder.build(buildSoapResponse('GetParameterValues', {
  ParameterNames: {
    '@_soap-enc:arrayType': `xsd:string[${names.length}]`,
    '@_xsi:type': 'soapenc:Array',
    string: names
  }
}));

console.log(xml);
