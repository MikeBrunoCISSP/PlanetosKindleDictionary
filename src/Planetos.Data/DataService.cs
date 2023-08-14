using Microsoft.EntityFrameworkCore;
using Planetos.Data.Models;
using Planetos.Shared;

namespace Planetos.Data;
public class DataService : IDataService {
    readonly PlanetosContext _context;
    public DataService() {
        _context = new PlanetosContext();
    }

    public async Task<IServiceOperationResult> CreateWord(string indexName, string name, string definition) {
        var result = new ServiceOperationResult();
        var idxResult = await getDictionaryIndex(indexName);
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

    public async Task<IServiceOperationResult<WordDefinition>> ReadWord(string name) {
        var result = new ServiceOperationResult<WordDefinition>();
        try {
            IQueryable<WordDefinition> query = _context.WordDefinitions;
            var word = await query.FirstOrDefaultAsync(x => x.Name == name);
            if (word is null) {
                result.HResult = ErrorCode.E_FILENOTFOUND;
                result.ErrorMessage = $"'{name}': Word does not exist.";
            } else {
                result.Value = word;
            }
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }
    public async Task<IServiceOperationResult> UpdateWord(string name, string newDefinition) {
        var result = new ServiceOperationResult();
        try {
            var findResult = await ReadWord(name);
            if (!findResult.IsSuccess) {
                return new ServiceOperationResult(findResult.HResult);
            }
            findResult.Value.Definition = newDefinition;
            await _context.SaveChangesAsync();
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }
    public async Task<IServiceOperationResult> DeleteWord(string name) {
        var result = new ServiceOperationResult();
        try {
            int delResult = await _context.WordDefinitions.Where(w => w.Name == name).ExecuteDeleteAsync();
            if (delResult != 1) {
                //log something.
            }
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }
    async Task<IServiceOperationResult<DictionaryIndex>> getDictionaryIndex(string indexName) {
        var result = new ServiceOperationResult<DictionaryIndex>();
        try {
            var charIdx = await _context.Indices.AsNoTracking()
            .FirstOrDefaultAsync(idx => idx.Name == indexName);
            if (charIdx is not null) {
                result.Value = charIdx;
                return result;
            }

            charIdx = new DictionaryIndex { Name = indexName };
            await _context.Indices.AddAsync(charIdx);
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
