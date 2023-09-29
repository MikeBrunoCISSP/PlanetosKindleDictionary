#nullable enable
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

namespace Planetos.Shared;

/// <summary>
/// Represents Newtonsoft.JSON (formerly, JSON.NET) implementation of <see cref="IDataSerializer"/> interface.
/// </summary>
public class NewtonsoftSerializer : IDataSerializer {
    static readonly JsonSerializerSettings _options = new() {
        ContractResolver = new CamelCasePropertyNamesContractResolver()
    };
    static NewtonsoftSerializer() {
        _options.Converters.Add(new VersionConverter());
    }

    /// <inheritdoc />
    public String SerializeObject(Object value) {
        return JsonConvert.SerializeObject(value, _options);
    }
    /// <inheritdoc />
    public Object? DeserializeObject(String json, Type? type = null) {
        if (type == null) {
            return JsonConvert.DeserializeObject(json, _options);
        }
        if (String.IsNullOrWhiteSpace(json)) {
            return default;
        }
        return JsonConvert.DeserializeObject(json, type, _options);
    }
    /// <inheritdoc />
    public TDto? DeserializeObject<TDto>(String json, Boolean nullSafe) {
        if (nullSafe) {
            return JsonConvert.DeserializeObject<TDto>(String.IsNullOrWhiteSpace(json) ? "{}" : json, _options);
        }

        if (String.IsNullOrWhiteSpace(json)) {
            return default;
        }
        return JsonConvert.DeserializeObject<TDto>(json);
    }
}
