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
        const String TYWIN = "Tywin";
        const String firstDefinition = "Does not shit gold.";
        const String secondDefinition = "Lord of Casterly Rock.";

        IServiceOperationResult result = await dataService.DeleteAll();
        Assert.IsTrue(result.IsSuccess);

        var tywin = new WordDefinition {
            kindleIndexId = IndexId.Characters,
            name = TYWIN,
            definition = firstDefinition,
            inflections = new List<Inflection> {
                new() { value = "Lannister" }
            }
        };
        IServiceOperationResult<WordDefinition> wordResult = await dataService.AddWord(tywin);
        Assert.IsTrue(wordResult.IsSuccess);
        Assert.AreEqual(TYWIN, wordResult.Value.name);

        const string WINTERFELL = "Winterfell";
        wordResult = await dataService.AddWord(IndexId.Locations, WINTERFELL, "Seat of House Stark");
        Assert.IsTrue(wordResult.IsSuccess);
        Assert.AreEqual(WINTERFELL, wordResult.Value.name);

        wordResult = await dataService.ReadWord(TYWIN);
        Assert.IsTrue(wordResult.IsSuccess);
        Assert.AreEqual(TYWIN, wordResult.Value.name);

        var updatedWord = wordResult.Value;
        updatedWord.definition = secondDefinition;
        wordResult = await dataService.UpdateWord(updatedWord);
        Assert.IsTrue(wordResult.IsSuccess);
        Assert.AreEqual(secondDefinition, wordResult.Value.definition);



        //wordResult = await dataService.UpdateWord(wordName, secondDefinition);
        //Assert.IsTrue(wordResult.IsSuccess);
        //Assert.AreEqual(secondDefinition, wordResult.Value.definition);

        //wordResult = await dataService.ReadWord(wordName);
        //Assert.IsTrue(wordResult.IsSuccess);
        //Assert.AreEqual(secondDefinition, wordResult.Value.definition);

        //result = await dataService.DeleteWord(wordName);
        //Assert.IsTrue(result.IsSuccess);

        //result = await dataService.DeleteIndex(indexName);
        //Assert.IsTrue(result.IsSuccess);
    }
}