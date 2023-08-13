using Microsoft.EntityFrameworkCore;
using Planetos.Data.Models;
using Planetos.Shared;

namespace Planetos.Data;
public class DataService : IDataService {
    readonly PlanetosContext _context;
    public DataService() {
        _context = new PlanetosContext();
    }
    public async Task<IServiceOperationResult> AddCharacter(string name, string definition) {
        return await addWordDefinition("Characters", name, definition);
    }

    public async Task<IServiceOperationResult> UpdateCharacter(string name, string definition) {
        throw new NotImplementedException();
    }

    public async Task<IServiceOperationResult> DeleteCharacter(string name) {
        throw new NotImplementedException();
    }

    public async Task<IServiceOperationResult> AddLocation(string name, string definition) {
        return await addWordDefinition("Locations", name, definition);
    }

    public async Task<IServiceOperationResult> UpdateLocation(string name, string definition) {
        throw new NotImplementedException();
    }

    public async Task<IServiceOperationResult> DeleteLocation(string name) {
        throw new NotImplementedException();
    }

    async Task<IServiceOperationResult> addWordDefinition(string indexName, string name, string definition) {
        var result = new ServiceOperationResult();
        var idxResult = await getIndex(indexName);
        if (idxResult.IsSuccess) {
            result.ErrorMessage = idxResult.ErrorMessage;
            return result;
        }

        var word = new WordDefinition {
            Name = name,
            Definition = definition
        };
        try {
            idxResult.Value.WordDefinitions.Add(word);
            await _context.SaveChangesAsync();
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    async Task<IServiceOperationResult<DictionaryIndex>> getIndex(string indexName) {
        var result = new ServiceOperationResult<DictionaryIndex>();
        var charIdx = _context.Indices.AsNoTracking()
            .FirstOrDefault(idx => idx.Name == indexName);
        if (charIdx is not null) {
            result.Value = charIdx;
            return result;
        }
        try {
            charIdx = new DictionaryIndex { Name = indexName };
            _context.Indices.Add(charIdx);
            await _context.SaveChangesAsync();
            result.Value = charIdx;
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    public void Dispose() {
        _context.Dispose();
    }
}
