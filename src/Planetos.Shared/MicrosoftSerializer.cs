#nullable enable
using System.Text.Json;


namespace Planetos.Shared;

/// <summary>
/// Represents Microsoft implementation of <see cref="IDataSerializer"/> interface. This implementation
/// uses System.Text.Json.
/// </summary>
public class MicrosoftSerializer : IDataSerializer {
    static readonly JsonSerializerOptions _options = new() {
        AllowTrailingCommas = true,
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        ReadCommentHandling = JsonCommentHandling.Skip,
        Converters = {
            new TypeJsonConverter(),
            new BigIntegerJsonConverter(),
            new DoubleJsonConverter()
        }
    };

    /// <inheritdoc />
    public String SerializeObject(Object value) {
        return JsonSerializer.Serialize(value, _options);
    }

    /// <inheritdoc />
    public Object? DeserializeObject(String json, Type? type = null) {
        if (String.IsNullOrWhiteSpace(json)) {
            return default;
        }

        if (type == null) {
            return JsonSerializer.Deserialize(json, typeof(Object), _options);
        }

        return JsonSerializer.Deserialize(json, type, _options);
    }

    /// <inheritdoc />
    public TDto? DeserializeObject<TDto>(String json, Boolean nullSafe) {
        if (nullSafe) {
            TDto? value =  JsonSerializer.Deserialize<TDto>(String.IsNullOrWhiteSpace(json) ? "{}" : json, _options);
            if (value == null && default(TDto) == null) {
                return Activator.CreateInstance<TDto>();
            }

            return value;
        }

        if (String.IsNullOrWhiteSpace(json)) {
            return default;
        }

        return JsonSerializer.Deserialize<TDto>(json, _options);
    }

    public static JsonSerializerOptions GetOptions() {
        return new JsonSerializerOptions(_options);
    }
}
