using AgenticAi.Agents.IntakePlanningAgent;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.Chunking;
using Xunit;

namespace Government_Service_Navigator.AgenticAi.Tests;

public class TextTokenizerTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void EmptyText_HasNoTokens(string? text)
    {
        Assert.Empty(TextTokenizer.Tokenize(text));
    }

    [Fact]
    public void LowercasesAndDropsStopWordsAndSingleLetters()
    {
        var tokens = TextTokenizer.Tokenize("I need to apply for a Passport, please!");

        Assert.Equal(new[] { "passport" }, tokens);
    }

    [Theory]
    [InlineData("certificates", "certificate")]
    [InlineData("licenses", "license")]
    [InlineData("policies", "policy")]
    [InlineData("business", "business")]
    [InlineData("bus", "bus")]
    public void StemsPlurals(string word, string expected)
    {
        Assert.Equal(new[] { expected }, TextTokenizer.Tokenize(word));
    }

    [Fact]
    public void KeepsNumbers()
    {
        Assert.Contains("2026", TextTokenizer.Tokenize("Gazette 2026"));
    }

    [Theory]
    [InlineData("renew", "renewal", true)]
    [InlineData("passport", "passport", true)]
    [InlineData("car", "cart", false)]
    [InlineData("license", "passport", false)]
    public void SharesKeyword_MatchesWordsAndLongPrefixes(string left, string right, bool expected)
    {
        Assert.Equal(expected, TextTokenizer.SharesKeyword(new[] { left }, new[] { right }));
    }

    [Fact]
    public void SharesKeyword_EmptySide_IsFalse()
    {
        Assert.False(TextTokenizer.SharesKeyword(Array.Empty<string>(), new[] { "passport" }));
    }
}

public class ServiceCatalogChunkTests
{
    [Fact]
    public void ParsesNameCategoryDocumentsAndFees()
    {
        var chunk = ServiceCatalogChunk.TryParse(
            "Driving License Renewal (Transport & Travel): To apply for this service, citizens must provide the following documents: NIC, Medical Certificate. The applicable fees are: LKR 2500 for Renewal Fee.");

        Assert.NotNull(chunk);
        Assert.Equal("Driving License Renewal", chunk!.ServiceName);
        Assert.Equal("Transport & Travel", chunk.Category);
        Assert.Equal(new[] { "NIC", "Medical Certificate" }, chunk.RequiredDocuments);
        Assert.Equal("LKR 2500 for Renewal Fee", chunk.FeeText);
    }

    [Fact]
    public void NameContainingBrackets_UsesTheLastBracketAsCategory()
    {
        var chunk = ServiceCatalogChunk.TryParse(
            "Certificate (Copy) Issue (Personal & Family): To apply for this service, citizens must provide the following documents: NIC. The applicable fees are: Free.");

        Assert.Equal("Certificate (Copy) Issue", chunk!.ServiceName);
        Assert.Equal("Personal & Family", chunk.Category);
    }

    [Fact]
    public void NoDocumentsRequired_GivesAnEmptyList()
    {
        var chunk = ServiceCatalogChunk.TryParse(
            "Inquiry (General): To apply for this service, citizens must provide the following documents: No specific documents required. The applicable fees are: Free.");

        Assert.Empty(chunk!.RequiredDocuments);
    }

    [Theory]
    [InlineData("")]
    [InlineData("Just some policy paragraph about passports.")]
    [InlineData("Name (Cat): no documents marker here. The applicable fees are: Free.")]
    public void UnrecognisedText_ReturnsNull(string content)
    {
        Assert.Null(ServiceCatalogChunk.TryParse(content));
    }

    [Fact]
    public void KeywordTokens_ComeFromNameAndCategory()
    {
        var chunk = ServiceCatalogChunk.TryParse(
            "Passport Renewal (Transport & Travel): To apply for this service, citizens must provide the following documents: NIC. The applicable fees are: Free.");

        var tokens = chunk!.KeywordTokens();

        Assert.Contains("passport", tokens);
        Assert.Contains("renewal", tokens);
        Assert.Contains("travel", tokens);
        Assert.DoesNotContain("nic", tokens);
    }
}

public class DocumentChunkerTests
{
    private readonly DocumentChunker _chunker = new();

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  \n ")]
    public void EmptyText_HasNoChunks(string? text)
    {
        Assert.Empty(_chunker.ChunkText(text!));
    }

    [Fact]
    public void ShortText_IsOneTrimmedChunk()
    {
        Assert.Equal(new[] { "Short policy." }, _chunker.ChunkText("  Short policy.  "));
    }

    [Fact]
    public void Paragraphs_AreGroupedUpToTheLimit()
    {
        var p = new string('a', 40);
        var text = string.Join("\n\n", p, p, p, p);

        var chunks = _chunker.ChunkText(text, maxChunkSize: 90);

        Assert.Equal(2, chunks.Count);
        Assert.Equal($"{p}\n\n{p}", chunks[0]);
        Assert.All(chunks, c => Assert.True(c.Length <= 90));
    }

    [Fact]
    public void WindowsLineBreaks_AlsoSplitParagraphs()
    {
        var p = new string('b', 60);

        var chunks = _chunker.ChunkText($"{p}\r\n\r\n{p}", maxChunkSize: 100);

        Assert.Equal(2, chunks.Count);
    }

    [Fact]
    public void OversizedParagraph_IsSplitByWords_WithoutLosingWords()
    {
        var words = Enumerable.Range(1, 200).Select(i => $"word{i}").ToList();
        var text = string.Join(" ", words);

        var chunks = _chunker.ChunkText(text, maxChunkSize: 100, overlap: 0);

        Assert.True(chunks.Count > 1);
        Assert.All(chunks, c => Assert.True(c.Length <= 100));
        var rejoined = chunks.SelectMany(c => c.Split(' ')).Distinct().ToList();
        Assert.Equal(words, rejoined);
    }

    [Fact]
    public void OversizedParagraph_WithOverlap_RepeatsWordsAcrossChunks()
    {
        var text = string.Join(" ", Enumerable.Range(1, 200).Select(i => $"word{i}"));

        // overlap 50 steps back 5 words between word-split chunks
        var chunks = _chunker.ChunkText(text, maxChunkSize: 100, overlap: 50);

        var lastOfFirst = chunks[0].Split(' ')[^1];
        Assert.Contains(lastOfFirst, chunks[1].Split(' '));
    }

    [Fact]
    public void ChunkDocument_NumbersChunksAndKeepsTheSource()
    {
        var p = new string('c', 60);

        var chunks = _chunker.ChunkDocument("Gazette 12", $"{p}\n\n{p}", "Service:1:GSN-SRV-001", maxChunkSize: 100);

        Assert.Equal(new[] { 0, 1 }, chunks.Select(c => c.ChunkIndex));
        Assert.All(chunks, c =>
        {
            Assert.Equal("Gazette 12", c.SourceTitle);
            Assert.Equal("Service:1:GSN-SRV-001", c.SourceCategory);
        });
    }
}
