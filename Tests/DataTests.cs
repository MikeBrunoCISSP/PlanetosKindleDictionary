using Planetos.Data;
using Planetos.Data.Models;
using Planetos.Shared;

namespace Tests;

[TestClass]
public class DataTests {
    private IDataService dataService = new DataService();
    [TestMethod]
    public async Task DataTest() {
        const String indexName = "characters";
        const String wordName = "Tywin";
        const String firstDefinition = "Does not shit gold.";
        const String secondDefinition = "Lord of Casterly Rock.";

        IServiceOperationResult result = await dataService.DeleteAll();
        Assert.IsTrue(result.IsSuccess);

        IServiceOperationResult<KindleIndex> indexResult = await dataService.CreateIndex(indexName);
        Assert.IsTrue(indexResult.IsSuccess);
        Assert.AreEqual(indexName, indexResult.Value.name);

        IServiceOperationResult<WordDefinition> wordResult = await dataService.CreateWord(indexName, wordName, firstDefinition);
        Assert.IsTrue(wordResult.IsSuccess);
        Assert.AreEqual(wordName, wordResult.Value.name);

        wordResult = await dataService.UpdateWord(wordName, secondDefinition);
        Assert.IsTrue(wordResult.IsSuccess);
        Assert.AreEqual(secondDefinition, wordResult.Value.definition);

        wordResult = await dataService.ReadWord(wordName);
        Assert.IsTrue(wordResult.IsSuccess);
        Assert.AreEqual(secondDefinition, wordResult.Value.definition);

        result = await dataService.DeleteWord(wordName);
        Assert.IsTrue(result.IsSuccess);

        result = await dataService.DeleteIndex(indexName);
        Assert.IsTrue(result.IsSuccess);
    }
}