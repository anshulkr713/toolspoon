import yaml from 'js-yaml';
import { js2xml } from 'xml-js';
import Papa from 'papaparse';
import { diffJson, type JsonValue } from './diffJson';
import { generateJsonSchema } from './generateSchema';
import { LooseJsonParseError, repairJson } from './repairJson';
import { buildTableModel } from './tableData';

type WorkerErrorSource = 'primary' | 'compare';

function getErrorLine(code: string, message: string) {
  const positionMatch = message.match(/at position (\d+)/);
  if (positionMatch && positionMatch[1]) {
    const position = parseInt(positionMatch[1], 10);
    return code.substring(0, position).split('\n').length;
  }

  const lineMatch = message.match(/line (\d+)/);
  if (lineMatch && lineMatch[1]) {
    return parseInt(lineMatch[1], 10);
  }

  return 1;
}

function postError(code: string, error: unknown, source: WorkerErrorSource) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const line = error instanceof LooseJsonParseError ? error.line : getErrorLine(code, message);
  self.postMessage({ type: 'ERROR', message, line, source });
}

self.onmessage = (e: MessageEvent) => {
  const { code, compareCode = '', action = 'FORMAT', indentSpace = 2, targetFormat = 'YAML' } = e.data;
  
  if (!code || typeof code !== 'string') {
    return;
  }

  let space: string | number = indentSpace;
  if (indentSpace === 'Tab') space = '\t';
  else if (typeof indentSpace === 'string') space = parseInt(indentSpace, 10);
  if (Number.isNaN(space)) space = 2; // Default fallback

  try {
    let result = '';

    if (action === 'DIFF') {
      if (!compareCode || typeof compareCode !== 'string') {
        self.postMessage({ type: 'ERROR', message: 'Paste the second JSON document to compare.', line: 1, source: 'compare' });
        return;
      }

      let leftJson: JsonValue;
      let rightJson: JsonValue;

      try {
        leftJson = JSON.parse(code) as JsonValue;
      } catch (error) {
        postError(code, error, 'primary');
        return;
      }

      try {
        rightJson = JSON.parse(compareCode) as JsonValue;
      } catch (error) {
        postError(compareCode, error, 'compare');
        return;
      }

      result = JSON.stringify(diffJson(leftJson, rightJson), null, space as string | number);
      self.postMessage({ type: 'SUCCESS', result });
      return;
    }

    const parsed = action === 'REPAIR' ? repairJson(code) : JSON.parse(code);

    if (action === 'VALIDATE') {
      self.postMessage({ type: 'SUCCESS', result: code, message: 'Valid JSON' });
      return;
    } else if (action === 'SCHEMA') {
      result = JSON.stringify(generateJsonSchema(parsed as JsonValue), null, space as string | number);
    } else if (action === 'TABLE') {
      const tableModel = buildTableModel(parsed as JsonValue);
      result = Papa.unparse({
        fields: tableModel.columns,
        data: tableModel.rows.map((row) => tableModel.columns.map((column) => row[column] ?? '')),
      });
    } else if (action === 'VISUALIZE') {
      result = JSON.stringify(parsed, null, space as string | number);
    } else if (action === 'REPAIR') {
      result = JSON.stringify(parsed, null, space as string | number);
    } else if (action === 'FORMAT') {
      result = JSON.stringify(parsed, null, space as string | number);
    } else if (action === 'MINIFY') {
      result = JSON.stringify(parsed);
    } else if (action === 'CONVERT') {
      if (targetFormat === 'YAML') {
        result = yaml.dump(parsed, { indent: typeof space === 'number' ? space : 2 });
      } else if (targetFormat === 'XML') {
        const xmlObj = Array.isArray(parsed) ? { root: { item: parsed } } : { root: parsed };
        result = js2xml(xmlObj, { compact: true, spaces: space });
      } else if (targetFormat === 'CSV') {
        const dataForCsv = Array.isArray(parsed) ? parsed : [parsed];
        result = Papa.unparse(dataForCsv);
      }
    }

    self.postMessage({ type: 'SUCCESS', result });
  } catch (error: unknown) {
    postError(code, error, 'primary');
  }
};
