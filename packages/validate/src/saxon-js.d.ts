/** `saxon-js` ships no types (see http://www.saxonica.com/saxon-js/). We only
 * ever call `.transform()`, typed precisely by SaxonJSLike in types.ts, so
 * this declaration only needs to not lie about that one method. */
declare module "saxon-js" {
  const SaxonJS: {
    transform(
      options: { stylesheetText: string; sourceText: string; destination: "serialized" },
      mode: "async",
    ): Promise<{ principalResult: string }>;
  };
  export default SaxonJS;
}
