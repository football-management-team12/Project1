from flask import Flask
from flask_cors import CORS
from flasgger import Swagger

app = Flask(__name__)

CORS(app)



# import blueprint sau khi có app
from routes.auth import auth_bp
from routes.field import field_bp
swagger = Swagger(app, template_file='swagger.yaml')


app.register_blueprint(
    auth_bp,
    url_prefix="/api/auth"
)


app.register_blueprint(
    field_bp,
    url_prefix="/api/fields"
)



@app.route("/")
def home():

    return {
        "message":"Backend running"
    }



if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )