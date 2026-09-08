import Resolver from '@forge/resolver';
import { registerPageContextResolvers } from './resolvers/page-context.js';

const resolver = new Resolver();

registerPageContextResolvers(resolver);

export const handler = resolver.getDefinitions();
