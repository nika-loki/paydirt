import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

import { AttributionExplorer } from './attribution-explorer';
import { Board } from './board/board';
import { DataModel } from './data-model';
import { EnvStepper } from './env-stepper';
import { FieldMap } from './field-map';
import { Mermaid } from './mermaid';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Mermaid,
    DataModel,
    FieldMap,
    EnvStepper,
    AttributionExplorer,
    Board,
    Steps,
    Step,
    Tabs,
    Tab,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
