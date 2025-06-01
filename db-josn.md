[
    {
        "module": "module it should be in singular one word",
        "fields": [
            {
                "name": "field_name",
                "type": "field_type", //Optional in hthe case to ref
                "ref": "Optional field  value should be one of module value"
            }
        ]
    }
]

example:
[
    {
        "module": "user",
        "fields": [
            {
                "name": "name",
                "type": "string"
            },
            {
                "name": "email",
                "type": "string"
            },
            {
                "name": "password",
                "type": "string"
            }
        ]
    },
    {
        "module": "post",
        "fields": [
            {
                "name": "title",
                "type": "string"
            },
            {
                "name": "user_id",
                "ref": "user"
            }
        ]
    }
]